/**
 * Learning Material Specialist
 * 
 * Tracks learning progress and structures knowledge into progressive pathways
 */

import { SodianStateType } from '../../core/state.js';
import { llmClient } from '../../lib/llm-client.js';
import { opikClient } from '../../lib/opik-client.js';

interface LearningContext {
    topic: string;
    currentLevel: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[];
    relatedProjects: string[];
    gaps: string[];
    nextSteps: string[];
}

interface LearningPathNode {
    name: string;
    status: 'locked' | 'in_progress' | 'completed';
    estimatedTime?: string;
}

// Helper: Progressive unlock logic
function getNextLevel(current: string): string {
    const progression: Record<string, string> = {
        'Fundamentals': 'Practical_Applications',
        'Practical_Applications': 'Advanced_Concepts',
        'Advanced_Concepts': 'Mastery_Projects'
    };
    return progression[current] || 'Complete';
}

export async function learningMaterialNode(state: SodianStateType): Promise<Partial<SodianStateType>> {
    const trace = opikClient.trace({
        name: 'Learning_Material_Specialist',
        input: { user_input: state.user_input },
        metadata: { agent: 'learning_material' }
    });

    try {
        const context = state.cognitive_context;

        // Analyze if this is learning material
        const learningCtx = await llmClient.invokeWithJSON<LearningContext>(
            [
                {
                    role: 'system',
                    content: `You are a learning path architect. Analyze if this content is educational material.

User's learning mode: ${context.preferences.learningMode}
User's recent topics: ${context.recentTopics.join(', ') || 'None'}

Extract:
1. topic: Main learning topic
2. currentLevel: beginner/intermediate/advanced
3. prerequisites: What should be known before this
4. relatedProjects: Practical applications
5. gaps: Knowledge gaps this reveals
6. nextSteps: What to learn next

Return as JSON.`
                },
                { role: 'user', content: state.user_input }
            ],
            { temperature: 0.3 },
            'Learning_Analysis'
        );

        // Check if this topic already exists (in real impl, query knowledge graph)
        const topicExists = context.recentTopics.includes(learningCtx.topic.toLowerCase());

        if (!topicExists) {
            // New learning path - create foundational structure
            const pathNodes: LearningPathNode[] = [
                { name: 'Fundamentals', status: 'in_progress', estimatedTime: '2-4 hours' },
                { name: 'Practical_Applications', status: 'locked', estimatedTime: '4-8 hours' },
                { name: 'Advanced_Concepts', status: 'locked', estimatedTime: '8-16 hours' }
            ];

            trace.end({ output: { action: 'create_path', topic: learningCtx.topic } });

            return {
                current_agent: 'learning_material',
                processing_stage: 'curation',
                knowledge_graph_updates: [{
                    type: 'learning_path',
                    action: 'create',
                    data: {
                        path: `/Learning/${learningCtx.topic}/`,
                        nodes: pathNodes,
                        prerequisites: learningCtx.prerequisites,
                        currentLevel: learningCtx.currentLevel
                    }
                }],
                system_log: [`Created new learning path for ${learningCtx.topic}`]
            };
        } else {
            // Update existing path - identify progression
            // In real implementation, we'd query the current progress
            const currentProgress = { name: 'Fundamentals', status: 'in_progress' };

            trace.end({ output: { action: 'update_progress', topic: learningCtx.topic } });

            return {
                current_agent: 'learning_material',
                processing_stage: 'curation',
                knowledge_graph_updates: [{
                    type: 'learning_progress',
                    action: 'update',
                    data: {
                        topic: learningCtx.topic,
                        completed: currentProgress.name,
                        unlocked: getNextLevel(currentProgress.name),
                        linksToProjects: learningCtx.relatedProjects,
                        gaps: learningCtx.gaps,
                        nextSteps: learningCtx.nextSteps
                    }
                }],
                system_log: [`Advanced learning progress in ${learningCtx.topic}`]
            };
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Learning analysis failed';
        trace.end({ output: { error: errorMsg } });
        return {
            error: errorMsg,
            system_log: [`Learning material error: ${errorMsg}`]
        };
    }
}
