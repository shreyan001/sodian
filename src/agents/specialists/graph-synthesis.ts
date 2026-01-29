/**
 * Graph Synthesis Specialist
 * 
 * Finds connections between notes and creates bidirectional links
 */

import { SodianStateType } from '../../core/state.js';
import { llmClient } from '../../lib/llm-client.js';
import { opikClient } from '../../lib/opik-client.js';

interface SynthesisLink {
    targetNote: string;
    relationship: string;
    strength: number;
    bidirectional: boolean;
}

interface SynthesisResult {
    links: SynthesisLink[];
    synthesisInsight: string | null;
    emergentTopic: string | null;
}

export async function graphSynthesisNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Graph_Synthesis_Specialist',
        input: {
            user_input: state.user_input,
            existingUpdates: state.knowledge_graph_updates.length
        },
        metadata: { agent: 'graph_synthesis' }
    });

    try {
        const context = state.cognitive_context;
        const classification = state.content_classification;

        // In a real implementation, we'd query the knowledge graph here
        // For now, we use the LLM to suggest connections based on context
        const result = await llmClient.invokeWithJSON<SynthesisResult>(
            [
                {
                    role: 'system',
                    content: `You are a graph synthesis specialist. Your job is to find meaningful connections between pieces of knowledge.

User's recent topics: ${context.recentTopics.join(', ') || 'None'}
User's known patterns: ${context.knownPatterns.join(', ') || 'None'}
Content domain: ${classification?.domain || 'general'}
Related concepts: ${classification?.relatedConcepts?.join(', ') || 'None'}

Analyze the content and suggest:
1. links: Array of connections to other concepts
   - targetNote: The concept/note to link to
   - relationship: Type of relationship (extends, contradicts, supports, implements, etc.)
   - strength: 0-1 confidence in the connection
   - bidirectional: Should the link go both ways?
2. synthesisInsight: Any new insight that emerges from combining this with existing knowledge
3. emergentTopic: If multiple concepts converge, what meta-topic emerges?

Return as JSON.`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.5 },
            'Graph_Synthesis_Analysis'
        );

        trace.end({ output: { result } });

        const updates = result.links.map(link => ({
            type: 'link' as const,
            action: 'create' as const,
            data: {
                source: 'current_note', // Will be resolved by graph layer
                target: link.targetNote,
                relationship: link.relationship,
                strength: link.strength,
                bidirectional: link.bidirectional
            }
        }));

        // Add synthesis insight as a new note if significant
        if (result.synthesisInsight) {
            updates.push({
                type: 'note' as const,
                action: 'create' as const,
                data: {
                    folder: '/Insights/',
                    filename: `synthesis-${Date.now()}`,
                    content: result.synthesisInsight,
                    isGenerated: true
                }
            });
        }

        return {
            current_agent: 'graph_synthesis',
            processing_stage: 'synthesis',
            knowledge_graph_updates: updates,
            system_log: [
                `Found ${result.links.length} connection(s)`,
                result.emergentTopic ? `Emergent topic: ${result.emergentTopic}` : ''
            ].filter(Boolean)
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Synthesis failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Synthesis error: ${errorMsg}`]
        };
    }
}
