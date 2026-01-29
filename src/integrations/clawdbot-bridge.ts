/**
 * Clawdbot Bridge
 * 
 * Integration layer between Sodian (brain) and Clawdbot (body/executor)
 */

import { v4 as uuidv4 } from 'uuid';
import { opikClient } from '../lib/opik-client.js';
import { DelegatedTask } from '../core/state.js';

interface ClawdbotResponse {
    taskId: string;
    status: 'accepted' | 'rejected' | 'queued';
    channel: string;
    estimatedCompletion?: string;
}

interface TaskResult {
    taskId: string;
    status: 'completed' | 'failed' | 'partial';
    output?: any;
    error?: string;
    metadata?: Record<string, unknown>;
}

export class ClawdbotBridge {
    private taskQueue: DelegatedTask[] = [];
    private endpoint: string;
    private apiKey: string | undefined;

    constructor() {
        this.endpoint = process.env.CLAWDBOT_ENDPOINT || 'http://localhost:3001';
        this.apiKey = process.env.CLAWDBOT_API_KEY;
    }

    /**
     * Delegate a high-level intention to Clawdbot
     */
    async delegateTask(intention: string, context: Record<string, unknown>): Promise<string> {
        const trace = opikClient.trace({
            name: 'Sodian_to_Clawdbot_Delegation',
            input: { intention, context },
            metadata: { bridge: 'cognitive_to_physical' }
        });

        try {
            // Parse intention into executable task
            const task = await this.parseIntention(intention, context);

            // Queue for Clawdbot worker
            this.taskQueue.push(task);

            // Send via Clawdbot's message queue
            const result = await this.sendToClawdbot(task);

            trace.end({
                output: {
                    taskId: task.id,
                    status: 'delegated',
                    channel: result.channel
                }
            });

            return task.id;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Delegation failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    /**
     * Parse natural language intention into structured task
     */
    private async parseIntention(intention: string, context: Record<string, unknown>): Promise<DelegatedTask> {
        const intentionLower = intention.toLowerCase();

        // Location-based reminder
        if (intentionLower.includes('remind') &&
            (intentionLower.includes('location') || intentionLower.includes('leaving') || intentionLower.includes('arriving'))) {
            return {
                id: `task_${uuidv4()}`,
                type: 'automation',
                priority: 'normal',
                payload: {
                    trigger: 'geofence_exit',
                    location: context.home_location || context.location || 'default',
                    action: {
                        type: 'audio_alert',
                        message: this.extractMessage(intention)
                    }
                },
                expectedOutcome: 'Audio played when user leaves location',
                status: 'pending'
            };
        }

        // Time-based reminder
        if (intentionLower.includes('remind') &&
            (intentionLower.includes('at') || intentionLower.includes('in') || intentionLower.includes('every'))) {
            return {
                id: `task_${uuidv4()}`,
                type: 'automation',
                priority: 'normal',
                payload: {
                    trigger: 'time_based',
                    schedule: this.extractTimeSchedule(intention),
                    action: {
                        type: 'notification',
                        message: this.extractMessage(intention)
                    }
                },
                expectedOutcome: 'Notification sent at scheduled time',
                status: 'pending'
            };
        }

        // Research task
        if (intentionLower.includes('research') || intentionLower.includes('find out') || intentionLower.includes('look up')) {
            return {
                id: `task_${uuidv4()}`,
                type: 'research',
                priority: 'normal',
                payload: {
                    query: intention,
                    depth: 'comprehensive',
                    sources: ['web', 'local_knowledge']
                },
                expectedOutcome: 'Research summary returned',
                status: 'pending'
            };
        }

        // File operation
        if (intentionLower.includes('create file') || intentionLower.includes('save') || intentionLower.includes('export')) {
            return {
                id: `task_${uuidv4()}`,
                type: 'file_operation',
                priority: 'normal',
                payload: {
                    operation: 'create',
                    content: context.content,
                    path: context.path
                },
                expectedOutcome: 'File created/saved',
                status: 'pending'
            };
        }

        // Generic notification
        return {
            id: `task_${uuidv4()}`,
            type: 'notification',
            priority: 'background',
            payload: {
                message: intention,
                context
            },
            expectedOutcome: 'User notified',
            status: 'pending'
        };
    }

    /**
     * Send task to Clawdbot for execution
     */
    private async sendToClawdbot(task: DelegatedTask): Promise<ClawdbotResponse> {
        try {
            const response = await fetch(`${this.endpoint}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
                },
                body: JSON.stringify(task)
            });

            if (!response.ok) {
                // Fallback for development/testing
                console.log('[ClawdbotBridge] Clawdbot not available, task queued locally');
                return {
                    taskId: task.id,
                    status: 'queued',
                    channel: 'local_queue'
                };
            }

            return await response.json() as ClawdbotResponse;
        } catch (error) {
            // Clawdbot not running - queue locally
            console.log('[ClawdbotBridge] Clawdbot not available, task queued locally');
            return {
                taskId: task.id,
                status: 'queued',
                channel: 'local_queue'
            };
        }
    }

    /**
     * Receive task results from Clawdbot
     */
    async receiveTaskResult(taskId: string, result: TaskResult): Promise<void> {
        const trace = opikClient.trace({
            name: 'Clawdbot_to_Sodian_Feedback',
            input: { taskId, result },
            metadata: { bridge: 'physical_to_cognitive' }
        });

        // Update knowledge graph with execution result
        await this.updateKnowledgeFromExecution(taskId, result);

        trace.end({ output: { updated: true } });
    }

    /**
     * Learn from execution results
     */
    private async updateKnowledgeFromExecution(taskId: string, result: TaskResult): Promise<void> {
        // Find the original task
        const task = this.taskQueue.find(t => t.id === taskId);

        if (result.status === 'failed' && task) {
            // Log failure for pattern analysis
            console.log(`[ClawdbotBridge] Task ${taskId} failed:`, result.error);
            // In production, this would update the knowledge graph with the failure
            // for the pattern recognition system to learn from
        }

        if (result.status === 'completed') {
            // Remove from queue
            const index = this.taskQueue.findIndex(t => t.id === taskId);
            if (index > -1) {
                this.taskQueue.splice(index, 1);
            }
        }
    }

    /**
     * Extract message from intention
     */
    private extractMessage(intention: string): string {
        // Extract the subject of the reminder
        const patterns = [
            /remind.*?about (.+?) when/i,
            /remind.*?to (.+?) when/i,
            /remind.*?about (.+)/i,
            /remind.*?to (.+)/i
        ];

        for (const pattern of patterns) {
            const match = intention.match(pattern);
            if (match) return match[1].trim();
        }

        return intention;
    }

    /**
     * Extract time schedule from intention
     */
    private extractTimeSchedule(intention: string): Record<string, unknown> {
        const intentionLower = intention.toLowerCase();

        // Daily at specific time
        const timeMatch = intention.match(/at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch) {
            return { type: 'daily', time: timeMatch[1] };
        }

        // Every X hours/minutes
        const intervalMatch = intention.match(/every (\d+) (hour|minute|day)/i);
        if (intervalMatch) {
            return {
                type: 'interval',
                value: parseInt(intervalMatch[1]),
                unit: intervalMatch[2]
            };
        }

        // In X hours/minutes
        const delayMatch = intention.match(/in (\d+) (hour|minute|day)/i);
        if (delayMatch) {
            return {
                type: 'delay',
                value: parseInt(delayMatch[1]),
                unit: delayMatch[2]
            };
        }

        return { type: 'unknown' };
    }

    /**
     * Get pending tasks
     */
    getPendingTasks(): DelegatedTask[] {
        return [...this.taskQueue];
    }
}

export const clawdbotBridge = new ClawdbotBridge();
