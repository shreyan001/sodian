/**
 * Knowledge Curation Specialist
 * 
 * Analyzes content and determines optimal organization structure
 */

import { SodianStateType } from '../../core/state.js';
import { llmClient } from '../../lib/llm-client.js';
import { opikClient } from '../../lib/opik-client.js';

interface CurationResult {
    folder: string;
    filename: string;
    shouldLink: string[];
    permanence: 'permanent' | 'evolving' | 'ephemeral';
    summary: string;
}

export async function curationNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Curation_Specialist',
        input: {
            user_input: state.user_input,
            classification: state.content_classification
        },
        metadata: { agent: 'curation' }
    });

    try {
        const classification = state.content_classification;
        const context = state.cognitive_context;

        const result = await llmClient.invokeWithJSON<CurationResult>(
            [
                {
                    role: 'system',
                    content: `You are a knowledge curator for a second brain system. Your job is to organize notes intelligently.

User's active projects: ${context.activeProjects.join(', ') || 'None'}
User's organization style: ${context.preferences.organizationStyle}
Content type: ${classification?.type || 'note'}
Domain: ${classification?.domain || 'general'}

Determine the optimal organization:
1. folder: Where this should be stored (use path like /Projects/AI/ or /Reference/Health/)
2. filename: Descriptive filename (kebab-case, no extension)
3. shouldLink: Array of topics this should link to
4. permanence: Will this content change? permanent/evolving/ephemeral
5. summary: One-line summary of the content

Return as JSON.`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.3 },
            'Curation_Analysis'
        );

        trace.end({ output: { result } });

        return {
            current_agent: 'curation',
            processing_stage: 'curation',
            knowledge_graph_updates: [{
                type: 'note',
                action: 'create',
                data: {
                    folder: result.folder,
                    filename: result.filename,
                    content: state.user_input,
                    summary: result.summary,
                    permanence: result.permanence,
                    pendingLinks: result.shouldLink
                }
            }],
            system_log: [`Curated to ${result.folder}${result.filename}`]
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Curation failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Curation error: ${errorMsg}`]
        };
    }
}
