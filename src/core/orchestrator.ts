/**
 * Sodian Orchestrator
 * 
 * Main LangGraph state machine coordinating specialist agents
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { SodianState, SodianStateType, ContentClassification } from './state.js';
import { llmClient } from '../lib/llm-client.js';
import { opikClient } from '../lib/opik-client.js';

// Import specialist nodes (will be created next)
import { curationNode } from '../agents/specialists/curation.js';
import { graphSynthesisNode } from '../agents/specialists/graph-synthesis.js';
import { autoTaggingNode } from '../agents/specialists/auto-tagging.js';
import { learningMaterialNode } from '../agents/specialists/learning-material.js';
import { patternRecognitionNode } from '../agents/specialists/pattern-recognition.js';

/**
 * Classification Node
 * Analyzes input and determines content type
 */
async function classificationNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Classification_Node',
        input: { user_input: state.user_input },
        metadata: { stage: 'classification' }
    });

    try {
        const classification = await llmClient.invokeWithJSON<ContentClassification>(
            [
                {
                    role: 'system',
                    content: `You are a content classifier for a second brain system. Analyze the input and classify it.
          
Return a JSON object with:
- type: "note" | "idea" | "solution" | "learning" | "task" | "reference" | "question"
- domain: the subject area (e.g., "productivity", "health", "coding", "adhd")
- urgency: "high" | "medium" | "low"
- permanence: "permanent" (evergreen), "evolving" (will be updated), "ephemeral" (temporary)
- relatedConcepts: array of related topic strings`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.3 },
            'Content_Classification'
        );

        trace.end({ output: { classification } });

        return {
            content_classification: classification,
            processing_stage: 'curation',
            system_log: [`Classified as ${classification.type} in domain ${classification.domain}`]
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Classification failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Classification error: ${errorMsg}`]
        };
    }
}

/**
 * Response Generation Node
 * Generates final user-facing response
 */
async function responseNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Response_Generation',
        input: {
            updates: state.knowledge_graph_updates.length,
            tasks: state.delegated_tasks.length
        },
        metadata: { stage: 'response' }
    });

    const summary = [];

    if (state.knowledge_graph_updates.length > 0) {
        summary.push(`📝 Made ${state.knowledge_graph_updates.length} knowledge graph update(s)`);

        for (const update of state.knowledge_graph_updates) {
            summary.push(`   - ${update.action}: ${update.type}`);
        }
    }

    if (state.delegated_tasks.length > 0) {
        summary.push(`🤖 Delegated ${state.delegated_tasks.length} task(s) to Clawdbot`);
    }

    const response = summary.length > 0
        ? summary.join('\n')
        : '✅ Processed input. No actions required.';

    trace.end({ output: { response } });

    return {
        response,
        processing_stage: 'complete',
        system_log: ['Generated response']
    };
}

/**
 * Route to appropriate specialist based on classification
 */
function routeToSpecialist(state: SodianStateType): string {
    if (state.error) {
        return 'response';
    }

    const classification = state.content_classification;
    if (!classification) {
        return 'response';
    }

    // Route based on content type
    switch (classification.type) {
        case 'learning':
            return 'learning_material';
        case 'solution':
        case 'idea':
            return 'pattern_recognition';
        case 'note':
        case 'reference':
        default:
            return 'curation';
    }
}

/**
 * Route after curation
 */
function routeAfterCuration(state: SodianStateType): string {
    if (state.error) return 'response';
    return 'graph_synthesis';
}

/**
 * Route after synthesis
 */
function routeAfterSynthesis(state: SodianStateType): string {
    if (state.error) return 'response';
    return 'auto_tagging';
}

/**
 * Route after tagging
 */
function routeAfterTagging(state: SodianStateType): string {
    if (state.error) return 'response';

    // Check if patterns should be analyzed
    const classification = state.content_classification;
    if (classification?.type === 'solution' || classification?.type === 'idea') {
        return 'pattern_recognition';
    }

    return 'response';
}

/**
 * Route after pattern recognition
 */
function routeAfterPattern(state: SodianStateType): string {
    return 'response';
}

/**
 * Route after learning material
 */
function routeAfterLearning(state: SodianStateType): string {
    if (state.error) return 'response';
    return 'graph_synthesis';
}

/**
 * Build the Sodian state graph
 */
export function buildSodianGraph() {
    const workflow = new StateGraph(SodianState)
        // Add nodes
        .addNode('classification', classificationNode)
        .addNode('curation', curationNode)
        .addNode('graph_synthesis', graphSynthesisNode)
        .addNode('auto_tagging', autoTaggingNode)
        .addNode('learning_material', learningMaterialNode)
        .addNode('pattern_recognition', patternRecognitionNode)
        .addNode('response', responseNode)

        // Entry point
        .addEdge(START, 'classification')

        // Conditional routing after classification
        .addConditionalEdges('classification', routeToSpecialist, {
            curation: 'curation',
            learning_material: 'learning_material',
            pattern_recognition: 'pattern_recognition',
            response: 'response'
        })

        // Flow after curation
        .addConditionalEdges('curation', routeAfterCuration, {
            graph_synthesis: 'graph_synthesis',
            response: 'response'
        })

        // Flow after synthesis
        .addConditionalEdges('graph_synthesis', routeAfterSynthesis, {
            auto_tagging: 'auto_tagging',
            response: 'response'
        })

        // Flow after tagging
        .addConditionalEdges('auto_tagging', routeAfterTagging, {
            pattern_recognition: 'pattern_recognition',
            response: 'response'
        })

        // Flow after pattern recognition
        .addConditionalEdges('pattern_recognition', routeAfterPattern, {
            response: 'response'
        })

        // Flow after learning material
        .addConditionalEdges('learning_material', routeAfterLearning, {
            graph_synthesis: 'graph_synthesis',
            response: 'response'
        })

        // End
        .addEdge('response', END);

    return workflow.compile();
}

// Export compiled graph
export const sodianApp = buildSodianGraph();
