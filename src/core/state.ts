/**
 * Sodian State Schema
 * 
 * Defines the LangGraph state annotation for the cognitive system
 */

import { Annotation } from '@langchain/langgraph';

// Knowledge Graph Update Types
export interface KnowledgeGraphUpdate {
    type: 'note' | 'link' | 'tag' | 'learning_path' | 'learning_progress' | 'meta_pattern';
    action: 'create' | 'update' | 'delete' | 'merge';
    data: Record<string, unknown>;
}

// Cognitive Context - User's mental model and preferences
export interface CognitiveContext {
    userId: string;
    activeProjects: string[];
    currentFocus: string | null;
    recentTopics: string[];
    knownPatterns: string[];
    preferences: {
        organizationStyle: 'hierarchical' | 'networked' | 'hybrid';
        tagPreference: 'verbose' | 'minimal' | 'balanced';
        learningMode: 'structured' | 'exploratory';
    };
}

// Delegated Task for Clawdbot
export interface DelegatedTask {
    id: string;
    type: 'automation' | 'research' | 'notification' | 'file_operation';
    priority: 'urgent' | 'normal' | 'background';
    payload: Record<string, unknown>;
    expectedOutcome: string;
    status: 'pending' | 'delegated' | 'completed' | 'failed';
}

// Processing Stage in the pipeline
export type ProcessingStage =
    | 'intake'
    | 'classification'
    | 'curation'
    | 'synthesis'
    | 'tagging'
    | 'pattern_detection'
    | 'delegation'
    | 'complete';

// Specialist Agent Types
export type SpecialistAgent =
    | 'curation'
    | 'graph_synthesis'
    | 'auto_tagging'
    | 'learning_material'
    | 'pattern_recognition'
    | 'executive';

// Content Classification
export interface ContentClassification {
    type: 'note' | 'idea' | 'solution' | 'learning' | 'task' | 'reference' | 'question';
    domain: string;
    urgency: 'high' | 'medium' | 'low';
    permanence: 'permanent' | 'evolving' | 'ephemeral';
    relatedConcepts: string[];
}

// Sodian State Annotation
export const SodianState = Annotation.Root({
    // Input
    user_input: Annotation<string>({
        reducer: (_, next) => next,
        default: () => ''
    }),

    // Processing context
    cognitive_context: Annotation<CognitiveContext>({
        reducer: (_, next) => next,
        default: () => ({
            userId: 'default',
            activeProjects: [],
            currentFocus: null,
            recentTopics: [],
            knownPatterns: [],
            preferences: {
                organizationStyle: 'hybrid',
                tagPreference: 'balanced',
                learningMode: 'exploratory'
            }
        })
    }),

    // Classification result
    content_classification: Annotation<ContentClassification | null>({
        reducer: (_, next) => next,
        default: () => null
    }),

    // Accumulated knowledge graph updates
    knowledge_graph_updates: Annotation<KnowledgeGraphUpdate[]>({
        reducer: (prev, next) => [...prev, ...next],
        default: () => []
    }),

    // Tasks to delegate to Clawdbot
    delegated_tasks: Annotation<DelegatedTask[]>({
        reducer: (prev, next) => [...prev, ...next],
        default: () => []
    }),

    // System logs for debugging
    system_log: Annotation<string[]>({
        reducer: (prev, next) => [...prev, ...next],
        default: () => []
    }),

    // Current processing state
    current_agent: Annotation<SpecialistAgent | null>({
        reducer: (_, next) => next,
        default: () => null
    }),

    processing_stage: Annotation<ProcessingStage>({
        reducer: (_, next) => next,
        default: () => 'intake'
    }),

    // Error handling
    error: Annotation<string | null>({
        reducer: (_, next) => next,
        default: () => null
    }),

    // Final response
    response: Annotation<string | null>({
        reducer: (_, next) => next,
        default: () => null
    })
});

// Export state type
export type SodianStateType = typeof SodianState.State;
