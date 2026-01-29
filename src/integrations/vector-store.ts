/**
 * Vector Store Integration
 * 
 * ChromaDB-based vector store for semantic search and embeddings
 */

import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { opikClient } from '../lib/opik-client.js';
import { llmClient } from '../lib/llm-client.js';

interface VectorDocument {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    embedding?: number[];
}

interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
}

export class VectorStore {
    private client: ChromaClient | null = null;
    private collection: Collection | null = null;
    private inMemoryStore: VectorDocument[] = [];
    private collectionName = 'sodian_knowledge';

    constructor() {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        const host = process.env.CHROMA_HOST;
        const port = process.env.CHROMA_PORT;

        if (host && port) {
            try {
                this.client = new ChromaClient({ path: `http://${host}:${port}` });
                this.collection = await this.client.getOrCreateCollection({
                    name: this.collectionName,
                    metadata: { description: 'Sodian knowledge base' }
                });
                console.log('[VectorStore] Connected to ChromaDB');
            } catch (error) {
                console.log('[VectorStore] ChromaDB not available, using in-memory store');
            }
        } else {
            console.log('[VectorStore] ChromaDB not configured, using in-memory store');
        }
    }

    /**
     * Add document to the vector store
     */
    async addDocument(doc: Omit<VectorDocument, 'embedding'>): Promise<void> {
        const trace = opikClient.trace({
            name: 'Vector_Store_Add',
            input: { id: doc.id },
            metadata: { operation: 'add' }
        });

        try {
            if (this.collection) {
                await this.collection.add({
                    ids: [doc.id],
                    documents: [doc.content],
                    metadatas: [doc.metadata as Record<string, string>]
                });
            } else {
                // In-memory fallback with simple embedding
                const embedding = await this.generateSimpleEmbedding(doc.content);
                this.inMemoryStore.push({ ...doc, embedding });
            }

            trace.end({ output: { added: true } });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Add failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    /**
     * Add multiple documents
     */
    async addDocuments(docs: Omit<VectorDocument, 'embedding'>[]): Promise<void> {
        for (const doc of docs) {
            await this.addDocument(doc);
        }
    }

    /**
     * Semantic search
     */
    async search(query: string, limit: number = 10): Promise<SearchResult[]> {
        const trace = opikClient.trace({
            name: 'Vector_Store_Search',
            input: { query, limit },
            metadata: { operation: 'search' }
        });

        try {
            if (this.collection) {
                const results = await this.collection.query({
                    queryTexts: [query],
                    nResults: limit,
                    include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances]
                });

                const searchResults: SearchResult[] = [];
                if (results.ids[0]) {
                    for (let i = 0; i < results.ids[0].length; i++) {
                        searchResults.push({
                            id: results.ids[0][i],
                            content: results.documents?.[0]?.[i] || '',
                            metadata: results.metadatas?.[0]?.[i] || {},
                            similarity: 1 - (results.distances?.[0]?.[i] || 0)
                        });
                    }
                }

                trace.end({ output: { resultCount: searchResults.length } });
                return searchResults;
            } else {
                // In-memory semantic search
                const queryEmbedding = await this.generateSimpleEmbedding(query);

                const scored = this.inMemoryStore.map(doc => ({
                    ...doc,
                    similarity: this.cosineSimilarity(queryEmbedding, doc.embedding || [])
                }));

                scored.sort((a, b) => b.similarity - a.similarity);

                const results = scored.slice(0, limit).map(doc => ({
                    id: doc.id,
                    content: doc.content,
                    metadata: doc.metadata,
                    similarity: doc.similarity
                }));

                trace.end({ output: { resultCount: results.length } });
                return results;
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Search failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    /**
     * Delete document
     */
    async deleteDocument(id: string): Promise<void> {
        if (this.collection) {
            await this.collection.delete({ ids: [id] });
        } else {
            const index = this.inMemoryStore.findIndex(doc => doc.id === id);
            if (index > -1) {
                this.inMemoryStore.splice(index, 1);
            }
        }
    }

    /**
     * Update document
     */
    async updateDocument(doc: Omit<VectorDocument, 'embedding'>): Promise<void> {
        await this.deleteDocument(doc.id);
        await this.addDocument(doc);
    }

    /**
     * Simple embedding generation (for in-memory fallback)
     * In production, use OpenAI embeddings or similar
     */
    private async generateSimpleEmbedding(text: string): Promise<number[]> {
        // Simple bag-of-words style embedding
        const words = text.toLowerCase().split(/\s+/);
        const vocab = new Map<string, number>();

        words.forEach((word, i) => {
            if (!vocab.has(word)) {
                vocab.set(word, vocab.size);
            }
        });

        const embedding = new Array(Math.min(vocab.size, 100)).fill(0);
        words.forEach(word => {
            const idx = vocab.get(word);
            if (idx !== undefined && idx < 100) {
                embedding[idx] += 1;
            }
        });

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return magnitude > 0 ? embedding.map(v => v / magnitude) : embedding;
    }

    /**
     * Cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            return 0;
        }

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Get statistics
     */
    getStats(): { documentCount: number } {
        return {
            documentCount: this.inMemoryStore.length
        };
    }
}

export const vectorStore = new VectorStore();
