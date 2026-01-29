/**
 * Auto-Tagging Specialist
 * 
 * Generates relevant tags and maintains tag hierarchy
 */

import { SodianStateType } from '../../core/state.js';
import { llmClient } from '../../lib/llm-client.js';
import { opikClient } from '../../lib/opik-client.js';

interface TagResult {
    primaryTags: string[];
    hierarchicalTags: string[];
    versionTag: string | null;
    actionTags: string[];
    contextTags: string[];
}

export async function autoTaggingNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Auto_Tagging_Specialist',
        input: {
            user_input: state.user_input,
            classification: state.content_classification
        },
        metadata: { agent: 'auto_tagging' }
    });

    try {
        const context = state.cognitive_context;
        const classification = state.content_classification;

        const result = await llmClient.invokeWithJSON<TagResult>(
            [
                {
                    role: 'system',
                    content: `You are a tagging specialist for a second brain. Generate meaningful tags.

User's tag preference: ${context.preferences.tagPreference}
Content type: ${classification?.type || 'note'}
Domain: ${classification?.domain || 'general'}
Permanence: ${classification?.permanence || 'evolving'}

Generate tags in these categories:
1. primaryTags: Main topic tags (2-4 tags, lowercase with hyphens)
2. hierarchicalTags: Nested tags like "health/mental" or "coding/javascript"
3. versionTag: If this is a solution that might evolve, suggest v1, v2, etc. (null if not applicable)
4. actionTags: Action-oriented tags like "to-review", "in-progress", "archived"
5. contextTags: Context tags like "work", "personal", "project-x"

Keep tags consistent with the user's preference:
- verbose: More descriptive, specific tags
- minimal: Only essential tags
- balanced: Mix of both

Return as JSON.`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.3 },
            'Auto_Tagging_Analysis'
        );

        trace.end({ output: { result } });

        // Combine all tags
        const allTags = [
            ...result.primaryTags,
            ...result.hierarchicalTags,
            ...(result.versionTag ? [result.versionTag] : []),
            ...result.actionTags,
            ...result.contextTags
        ];

        return {
            current_agent: 'auto_tagging',
            processing_stage: 'tagging',
            knowledge_graph_updates: [{
                type: 'tag',
                action: 'create',
                data: {
                    tags: allTags,
                    primaryTags: result.primaryTags,
                    hierarchicalTags: result.hierarchicalTags,
                    versionTag: result.versionTag,
                    actionTags: result.actionTags,
                    contextTags: result.contextTags
                }
            }],
            system_log: [`Applied ${allTags.length} tag(s): ${allTags.slice(0, 5).join(', ')}${allTags.length > 5 ? '...' : ''}`]
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Tagging failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Tagging error: ${errorMsg}`]
        };
    }
}
