/**
 * Memory Consolidation
 * 
 * Extracts patterns from daily activities and strengthens memory connections
 */

import { opikClient } from '../lib/opik-client.js';
import { knowledgeGraph } from '../integrations/knowledge-graph.js';

interface PatternMatch {
    sourceNote: string;
    targetNote: string;
    frequency: number;
    lastAccessed: Date;
}

interface ConsolidationResult {
    patternsFound: number;
    linksStrengthened: number;
    insightsGenerated: string[];
}

export class MemoryConsolidation {
    /**
     * Extract patterns from today's activities
     */
    async extractPatterns(activities: any[]): Promise<PatternMatch[]> {
        const trace = opikClient.trace({
            name: 'Pattern_Extraction',
            input: { activityCount: activities.length },
            metadata: { operation: 'extract_patterns' }
        });

        const patterns: PatternMatch[] = [];
        const accessPairs = new Map<string, { count: number; lastAccess: Date }>();

        // Track co-accessed notes
        for (let i = 0; i < activities.length; i++) {
            for (let j = i + 1; j < activities.length; j++) {
                const activity1 = activities[i];
                const activity2 = activities[j];

                // If accessed within 5 minutes of each other, consider them related
                const timeDiff = Math.abs(
                    new Date(activity1.timestamp).getTime() -
                    new Date(activity2.timestamp).getTime()
                );

                if (timeDiff < 5 * 60 * 1000) {
                    const key = [activity1.noteId, activity2.noteId].sort().join('::');
                    const existing = accessPairs.get(key) || { count: 0, lastAccess: new Date(0) };
                    accessPairs.set(key, {
                        count: existing.count + 1,
                        lastAccess: new Date(Math.max(
                            existing.lastAccess.getTime(),
                            new Date(activity1.timestamp).getTime()
                        ))
                    });
                }
            }
        }

        // Convert to patterns
        for (const [key, value] of accessPairs) {
            const [source, target] = key.split('::');
            patterns.push({
                sourceNote: source,
                targetNote: target,
                frequency: value.count,
                lastAccessed: value.lastAccess
            });
        }

        trace.end({ output: { patternCount: patterns.length } });
        return patterns;
    }

    /**
     * Strengthen links based on patterns
     */
    async strengthenLinks(patterns: PatternMatch[]): Promise<number> {
        let strengthened = 0;

        for (const pattern of patterns) {
            if (pattern.frequency > 2) {
                await knowledgeGraph.incrementLinkWeight(
                    pattern.sourceNote,
                    pattern.targetNote
                );
                strengthened++;
            }
        }

        return strengthened;
    }

    /**
     * Generate insights from patterns
     */
    async generateInsights(patterns: PatternMatch[]): Promise<string[]> {
        const insights: string[] = [];

        // Find highly connected clusters
        const connectionCounts = new Map<string, number>();
        for (const pattern of patterns) {
            connectionCounts.set(
                pattern.sourceNote,
                (connectionCounts.get(pattern.sourceNote) || 0) + pattern.frequency
            );
            connectionCounts.set(
                pattern.targetNote,
                (connectionCounts.get(pattern.targetNote) || 0) + pattern.frequency
            );
        }

        // Sort by connection count
        const sorted = Array.from(connectionCounts.entries())
            .sort((a, b) => b[1] - a[1]);

        // Top 3 most connected notes
        if (sorted.length >= 3) {
            insights.push(
                `Your most connected concepts today: ${sorted.slice(0, 3).map(s => s[0]).join(', ')}`
            );
        }

        // Emerging connections
        const newConnections = patterns.filter(p => p.frequency === 1 &&
            new Date().getTime() - p.lastAccessed.getTime() < 24 * 60 * 60 * 1000
        );

        if (newConnections.length > 0) {
            insights.push(
                `${newConnections.length} new connection(s) emerged today`
            );
        }

        return insights;
    }

    /**
     * Run full consolidation
     */
    async consolidate(activities: any[]): Promise<ConsolidationResult> {
        const trace = opikClient.trace({
            name: 'Memory_Consolidation',
            input: { activityCount: activities.length },
            metadata: { operation: 'consolidate' }
        });

        try {
            const patterns = await this.extractPatterns(activities);
            const strengthened = await this.strengthenLinks(patterns);
            const insights = await this.generateInsights(patterns);

            const result: ConsolidationResult = {
                patternsFound: patterns.length,
                linksStrengthened: strengthened,
                insightsGenerated: insights
            };

            trace.end({ output: result });
            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Consolidation failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }
}

export const memoryConsolidation = new MemoryConsolidation();
