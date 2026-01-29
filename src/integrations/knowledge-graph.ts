/**
 * Knowledge Graph Integration
 * 
 * Neo4j-based knowledge graph for storing and querying connections
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import { opikClient } from '../lib/opik-client.js';
import { KnowledgeGraphUpdate } from '../core/state.js';

interface GraphNode {
    id: string;
    type: string;
    properties: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

interface GraphLink {
    id: string;
    source: string;
    target: string;
    relationship: string;
    strength: number;
    bidirectional: boolean;
}

interface QueryResult {
    nodes: GraphNode[];
    links: GraphLink[];
}

export class KnowledgeGraph {
    private driver: Driver | null = null;
    private inMemoryNodes: Map<string, GraphNode> = new Map();
    private inMemoryLinks: GraphLink[] = [];

    constructor() {
        this.initializeDriver();
    }

    private initializeDriver(): void {
        const uri = process.env.NEO4J_URI;
        const user = process.env.NEO4J_USER;
        const password = process.env.NEO4J_PASSWORD;

        if (uri && user && password) {
            try {
                this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
                console.log('[KnowledgeGraph] Connected to Neo4j');
            } catch (error) {
                console.log('[KnowledgeGraph] Neo4j not available, using in-memory store');
            }
        } else {
            console.log('[KnowledgeGraph] Neo4j credentials not configured, using in-memory store');
        }
    }

    /**
     * Apply a batch of knowledge graph updates
     */
    async applyUpdates(updates: KnowledgeGraphUpdate[]): Promise<void> {
        const trace = opikClient.trace({
            name: 'Knowledge_Graph_Update',
            input: { updateCount: updates.length },
            metadata: { operation: 'batch_update' }
        });

        try {
            for (const update of updates) {
                switch (update.type) {
                    case 'note':
                        await this.handleNoteUpdate(update);
                        break;
                    case 'link':
                        await this.handleLinkUpdate(update);
                        break;
                    case 'tag':
                        await this.handleTagUpdate(update);
                        break;
                    case 'learning_path':
                    case 'learning_progress':
                        await this.handleLearningUpdate(update);
                        break;
                    case 'meta_pattern':
                        await this.handlePatternUpdate(update);
                        break;
                }
            }

            trace.end({ output: { applied: updates.length } });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Update failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    private async handleNoteUpdate(update: KnowledgeGraphUpdate): Promise<void> {
        const data = update.data as Record<string, unknown>;
        const id = `note_${Date.now()}`;

        const node: GraphNode = {
            id,
            type: 'Note',
            properties: data,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (this.driver) {
            const session = this.driver.session();
            try {
                await session.run(
                    `CREATE (n:Note {id: $id, folder: $folder, filename: $filename, content: $content, summary: $summary, createdAt: datetime()})`,
                    { id, ...data }
                );
            } finally {
                await session.close();
            }
        } else {
            this.inMemoryNodes.set(id, node);
        }
    }

    private async handleLinkUpdate(update: KnowledgeGraphUpdate): Promise<void> {
        const data = update.data as Record<string, unknown>;

        const link: GraphLink = {
            id: `link_${Date.now()}`,
            source: data.source as string,
            target: data.target as string,
            relationship: data.relationship as string,
            strength: data.strength as number || 1.0,
            bidirectional: data.bidirectional as boolean || false
        };

        if (this.driver) {
            const session = this.driver.session();
            try {
                await session.run(
                    `MATCH (a {id: $source}), (b {id: $target})
           CREATE (a)-[r:${link.relationship.toUpperCase()} {strength: $strength}]->(b)`,
                    { source: link.source, target: link.target, strength: link.strength }
                );

                if (link.bidirectional) {
                    await session.run(
                        `MATCH (a {id: $source}), (b {id: $target})
             CREATE (b)-[r:${link.relationship.toUpperCase()} {strength: $strength}]->(a)`,
                        { source: link.source, target: link.target, strength: link.strength }
                    );
                }
            } finally {
                await session.close();
            }
        } else {
            this.inMemoryLinks.push(link);
        }
    }

    private async handleTagUpdate(update: KnowledgeGraphUpdate): Promise<void> {
        const data = update.data as Record<string, unknown>;
        const tags = data.tags as string[];

        // Tags are stored as nodes linked to content
        for (const tag of tags) {
            const tagNode: GraphNode = {
                id: `tag_${tag}`,
                type: 'Tag',
                properties: { name: tag },
                createdAt: new Date(),
                updatedAt: new Date()
            };

            if (!this.inMemoryNodes.has(tagNode.id)) {
                this.inMemoryNodes.set(tagNode.id, tagNode);
            }
        }
    }

    private async handleLearningUpdate(update: KnowledgeGraphUpdate): Promise<void> {
        const data = update.data as Record<string, unknown>;
        const id = `learning_${Date.now()}`;

        const node: GraphNode = {
            id,
            type: 'LearningPath',
            properties: data,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.inMemoryNodes.set(id, node);
    }

    private async handlePatternUpdate(update: KnowledgeGraphUpdate): Promise<void> {
        const data = update.data as Record<string, unknown>;
        const id = `pattern_${Date.now()}`;

        const node: GraphNode = {
            id,
            type: 'MetaPattern',
            properties: data,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.inMemoryNodes.set(id, node);
    }

    /**
     * Query the knowledge graph
     */
    async query(topic: string): Promise<QueryResult> {
        if (this.driver) {
            const session = this.driver.session();
            try {
                const result = await session.run(
                    `MATCH (n)-[r]-(m) 
           WHERE n.content CONTAINS $topic OR n.summary CONTAINS $topic
           RETURN n, r, m LIMIT 50`,
                    { topic }
                );

                // Transform results
                const nodes: GraphNode[] = [];
                const links: GraphLink[] = [];

                // Process Neo4j results...
                return { nodes, links };
            } finally {
                await session.close();
            }
        } else {
            // In-memory search
            const matchingNodes = Array.from(this.inMemoryNodes.values()).filter(node => {
                const content = JSON.stringify(node.properties).toLowerCase();
                return content.includes(topic.toLowerCase());
            });

            const matchingLinks = this.inMemoryLinks.filter(link =>
                matchingNodes.some(n => n.id === link.source || n.id === link.target)
            );

            return { nodes: matchingNodes, links: matchingLinks };
        }
    }

    /**
     * Get solutions for pattern analysis
     */
    async querySolutions(context: any): Promise<any[]> {
        const nodes = Array.from(this.inMemoryNodes.values()).filter(
            node => node.type === 'Note' &&
                (node.properties as any).folder?.includes('Solutions')
        );
        return nodes;
    }

    /**
     * Query weak links for pruning
     */
    async queryWeakLinks(options: { days: number; threshold: number }): Promise<GraphLink[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - options.days);

        return this.inMemoryLinks.filter(link => link.strength < options.threshold);
    }

    /**
     * Increment link weight
     */
    async incrementLinkWeight(source: string, target: string): Promise<void> {
        const link = this.inMemoryLinks.find(
            l => l.source === source && l.target === target
        );
        if (link) {
            link.strength = Math.min(1.0, link.strength + 0.1);
        }
    }

    /**
     * Remove a link
     */
    async removeLink(linkId: string): Promise<void> {
        const index = this.inMemoryLinks.findIndex(l => l.id === linkId);
        if (index > -1) {
            this.inMemoryLinks.splice(index, 1);
        }
    }

    /**
     * Get statistics
     */
    getStats(): { nodes: number; links: number } {
        return {
            nodes: this.inMemoryNodes.size,
            links: this.inMemoryLinks.length
        };
    }

    /**
     * Close connection
     */
    async close(): Promise<void> {
        if (this.driver) {
            await this.driver.close();
        }
    }
}

export const knowledgeGraph = new KnowledgeGraph();
