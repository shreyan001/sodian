/**
 * LLM Client - Language Model Interface
 * 
 * Provides a unified interface for LLM operations with configurable models
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { opikClient } from './opik-client.js';

interface LLMConfig {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

class LLMClient {
    private defaultModel: string;
    private defaultTemperature: number;

    constructor() {
        this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4';
        this.defaultTemperature = 0.7;
    }

    private createClient(config?: LLMConfig): ChatOpenAI {
        return new ChatOpenAI({
            modelName: config?.model || this.defaultModel,
            temperature: config?.temperature ?? this.defaultTemperature,
            maxTokens: config?.maxTokens,
            openAIApiKey: process.env.OPENAI_API_KEY
        });
    }

    private convertMessages(messages: ChatMessage[]): BaseMessage[] {
        return messages.map(msg => {
            switch (msg.role) {
                case 'system':
                    return new SystemMessage(msg.content);
                case 'user':
                    return new HumanMessage(msg.content);
                case 'assistant':
                    return new AIMessage(msg.content);
                default:
                    return new HumanMessage(msg.content);
            }
        });
    }

    async invoke(
        messages: ChatMessage[],
        config?: LLMConfig,
        traceName?: string
    ): Promise<string> {
        const trace = opikClient.trace({
            name: traceName || 'LLM_Invoke',
            input: { messages, config },
            metadata: { model: config?.model || this.defaultModel }
        });

        try {
            const client = this.createClient(config);
            const langchainMessages = this.convertMessages(messages);
            const response = await client.invoke(langchainMessages);
            const content = typeof response.content === 'string'
                ? response.content
                : JSON.stringify(response.content);

            trace.end({ output: { content, tokenUsage: response.usage_metadata } });
            return content;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            trace.end({ output: { error: errorMessage } });
            throw error;
        }
    }

    async invokeWithJSON<T>(
        messages: ChatMessage[],
        config?: LLMConfig,
        traceName?: string
    ): Promise<T> {
        const response = await this.invoke(messages, config, traceName);

        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as T;
            }
            return JSON.parse(response) as T;
        } catch {
            throw new Error(`Failed to parse LLM response as JSON: ${response}`);
        }
    }

    async stream(
        messages: ChatMessage[],
        config?: LLMConfig,
        onToken?: (token: string) => void
    ): Promise<string> {
        const client = this.createClient(config);
        const langchainMessages = this.convertMessages(messages);

        let fullResponse = '';
        const stream = await client.stream(langchainMessages);

        for await (const chunk of stream) {
            const content = typeof chunk.content === 'string' ? chunk.content : '';
            fullResponse += content;
            onToken?.(content);
        }

        return fullResponse;
    }
}

// Singleton instance
export const llmClient = new LLMClient();

export type { LLMConfig, ChatMessage };
