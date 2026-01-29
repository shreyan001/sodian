/**
 * Pattern Recognition Specialist
 * 
 * Identifies meta-patterns across solutions and proactively suggests applications
 */

import { SodianStateType } from '../../core/state.js';
import { llmClient } from '../../lib/llm-client.js';
import { opikClient } from '../../lib/opik-client.js';
import { v4 as uuidv4 } from 'uuid';

interface PatternAnalysis {
    commonMechanism: string | null;
    problemDomains: string[];
    effectiveness: number;
    transferablePrinciples: string[];
    suggestedApplications: string[];
}

interface MetaPattern {
    name: string;
    mechanism: string;
    solves: string[];
    suggestedApplications: string[];
}

export async function patternRecognitionNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Pattern_Recognition_Specialist',
        input: { user_input: state.user_input },
        metadata: { agent: 'pattern_recognition' }
    });

    try {
        const context = state.cognitive_context;
        const classification = state.content_classification;

        // Analyze for patterns
        const analysis = await llmClient.invokeWithJSON<PatternAnalysis>(
            [
                {
                    role: 'system',
                    content: `You are a pattern recognition specialist. Analyze this solution/idea for transferable patterns.

User's known patterns: ${context.knownPatterns.join(', ') || 'None'}
Content type: ${classification?.type || 'solution'}
Domain: ${classification?.domain || 'general'}

Identify:
1. commonMechanism: The underlying mechanism (e.g., "location_trigger", "time_based", "habit_stacking")
2. problemDomains: What types of problems this solves
3. effectiveness: Estimated effectiveness 0-1 based on how well-defined the solution is
4. transferablePrinciples: Abstract principles that could apply elsewhere
5. suggestedApplications: Specific other problems this pattern could solve

Return as JSON.`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.5 },
            'Pattern_Analysis'
        );

        trace.end({ output: { analysis } });

        const updates: any[] = [];
        const tasks: any[] = [];

        // If we found a strong pattern, create a meta-pattern and suggest applications
        if (analysis.commonMechanism && analysis.effectiveness > 0.7) {
            const pattern: MetaPattern = {
                name: formatPatternName(analysis.commonMechanism),
                mechanism: analysis.commonMechanism,
                solves: analysis.problemDomains,
                suggestedApplications: analysis.suggestedApplications
            };

            updates.push({
                type: 'meta_pattern',
                action: 'create',
                data: pattern
            });

            // Create a delegation task to notify user about the pattern
            if (analysis.suggestedApplications.length > 0) {
                tasks.push({
                    id: `task_${uuidv4()}`,
                    type: 'notification',
                    priority: 'normal',
                    payload: {
                        message: `I noticed "${pattern.name}" works well for you. This pattern could also help with:\n${analysis.suggestedApplications.map(a => `• ${a}`).join('\n')}`,
                        action: 'pattern_suggestion'
                    },
                    expectedOutcome: 'User notified about transferable pattern',
                    status: 'pending'
                });
            }

            return {
                current_agent: 'pattern_recognition',
                processing_stage: 'pattern_detection',
                knowledge_graph_updates: updates,
                delegated_tasks: tasks,
                system_log: [
                    `Identified transferable pattern: ${analysis.commonMechanism}`,
                    `Effectiveness: ${(analysis.effectiveness * 100).toFixed(0)}%`,
                    `Suggested ${analysis.suggestedApplications.length} application(s)`
                ]
            };
        }

        return {
            current_agent: 'pattern_recognition',
            processing_stage: 'pattern_detection',
            system_log: ['No actionable patterns detected yet']
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Pattern recognition failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Pattern recognition error: ${errorMsg}`]
        };
    }
}

function formatPatternName(mechanism: string): string {
    return mechanism
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('-') + ' Solutions';
}
