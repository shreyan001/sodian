/**
 * Executive Manager
 * 
 * Coordinates specialist selection and manages the processing pipeline
 */

import { SodianStateType, SpecialistAgent } from '../../core/state.js';
import { opikClient } from '../../lib/opik-client.js';

interface ExecutiveDecision {
    selectedAgents: SpecialistAgent[];
    priority: 'high' | 'normal' | 'low';
    parallelizable: boolean;
    reasoning: string;
}

export class ExecutiveManager {
    /**
     * Determine which specialists should process the content
     */
    async selectSpecialists(state: SodianStateType): Promise<ExecutiveDecision> {
        const trace = opikClient.trace({
            name: 'Executive_Decision',
            input: { classification: state.content_classification },
            metadata: { role: 'executive' }
        });

        const classification = state.content_classification;
        if (!classification) {
            trace.end({ output: { error: 'No classification available' } });
            return {
                selectedAgents: ['curation'],
                priority: 'normal',
                parallelizable: false,
                reasoning: 'Default to curation without classification'
            };
        }

        const agents: SpecialistAgent[] = [];
        let reasoning = '';

        // Always start with curation for organization
        agents.push('curation');

        // Add graph synthesis for connection discovery
        agents.push('graph_synthesis');

        // Add auto-tagging
        agents.push('auto_tagging');

        // Conditional specialists based on content type
        switch (classification.type) {
            case 'learning':
                agents.push('learning_material');
                reasoning = 'Learning content detected - adding learning path specialist';
                break;
            case 'solution':
            case 'idea':
                agents.push('pattern_recognition');
                reasoning = 'Solution/idea detected - adding pattern recognition';
                break;
            case 'question':
                reasoning = 'Question detected - will search knowledge base';
                break;
            default:
                reasoning = 'Standard processing pipeline';
        }

        // Determine priority based on urgency
        const priority = classification.urgency;

        trace.end({
            output: {
                agents,
                priority,
                reasoning
            }
        });

        return {
            selectedAgents: agents,
            priority,
            parallelizable: false, // Sequential processing for now
            reasoning
        };
    }

    /**
     * Resolve conflicts between specialist outputs
     */
    resolveConflicts(updates: any[]): any[] {
        // Remove duplicate tag updates
        const seenTags = new Set<string>();
        const deduped = updates.filter(update => {
            if (update.type === 'tag') {
                const key = JSON.stringify(update.data.tags?.sort());
                if (seenTags.has(key)) return false;
                seenTags.add(key);
            }
            return true;
        });

        // Merge link updates with the same target
        const linkMap = new Map<string, any>();
        const nonLinks: any[] = [];

        for (const update of deduped) {
            if (update.type === 'link') {
                const target = update.data.target;
                if (linkMap.has(target)) {
                    // Merge: take higher strength
                    const existing = linkMap.get(target);
                    if (update.data.strength > existing.data.strength) {
                        linkMap.set(target, update);
                    }
                } else {
                    linkMap.set(target, update);
                }
            } else {
                nonLinks.push(update);
            }
        }

        return [...nonLinks, ...linkMap.values()];
    }

    /**
     * Generate execution summary
     */
    generateSummary(state: SodianStateType): string {
        const updates = state.knowledge_graph_updates;
        const tasks = state.delegated_tasks;
        const logs = state.system_log;

        const parts = [];

        if (updates.length > 0) {
            const byType = updates.reduce((acc, u) => {
                acc[u.type] = (acc[u.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            parts.push(`Knowledge updates: ${Object.entries(byType).map(([k, v]) => `${v} ${k}(s)`).join(', ')}`);
        }

        if (tasks.length > 0) {
            parts.push(`Delegated ${tasks.length} task(s) to Clawdbot`);
        }

        if (parts.length === 0) {
            parts.push('Processed without changes');
        }

        return parts.join('. ');
    }
}

export const executiveManager = new ExecutiveManager();
