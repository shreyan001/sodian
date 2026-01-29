/**
 * Opik Client - Observability and Tracing
 * 
 * Provides tracing capabilities for monitoring Sodian's cognitive operations
 */

import { v4 as uuidv4 } from 'uuid';

interface TraceOptions {
    name: string;
    input: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

interface Span {
    id: string;
    name: string;
    startTime: Date;
    input: Record<string, unknown>;
    metadata: Record<string, unknown>;
    output?: Record<string, unknown>;
    endTime?: Date;
}

class OpikTrace {
    private spans: Span[] = [];
    private traceId: string;
    private projectName: string;

    constructor(
        private options: TraceOptions,
        projectName: string
    ) {
        this.traceId = uuidv4();
        this.projectName = projectName;
        this.spans.push({
            id: this.traceId,
            name: options.name,
            startTime: new Date(),
            input: options.input,
            metadata: options.metadata || {}
        });

        this.log('Trace started');
    }

    span(options: TraceOptions): OpikSpan {
        const span: Span = {
            id: uuidv4(),
            name: options.name,
            startTime: new Date(),
            input: options.input,
            metadata: options.metadata || {}
        };
        this.spans.push(span);
        return new OpikSpan(span, this);
    }

    end(result: { output: Record<string, unknown> }): void {
        const rootSpan = this.spans[0];
        rootSpan.output = result.output;
        rootSpan.endTime = new Date();
        this.log('Trace ended', result.output);
        this.flush();
    }

    private log(message: string, data?: unknown): void {
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(`[Opik:${this.options.name}] ${message}`, data ? JSON.stringify(data) : '');
        }
    }

    private flush(): void {
        // In production, this would send to Opik server
        // For now, we log to console in development
        if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
            console.log('[Opik] Trace data:', JSON.stringify(this.spans, null, 2));
        }
    }

    updateSpan(span: Span): void {
        const index = this.spans.findIndex(s => s.id === span.id);
        if (index !== -1) {
            this.spans[index] = span;
        }
    }
}

class OpikSpan {
    constructor(
        private span: Span,
        private trace: OpikTrace
    ) { }

    end(result: { output: Record<string, unknown> }): void {
        this.span.output = result.output;
        this.span.endTime = new Date();
        this.trace.updateSpan(this.span);
    }
}

class OpikClient {
    private projectName: string;
    private apiKey: string | undefined;

    constructor() {
        this.projectName = process.env.OPIK_PROJECT_NAME || 'sodian';
        this.apiKey = process.env.OPIK_API_KEY;
    }

    trace(options: TraceOptions): OpikTrace {
        return new OpikTrace(options, this.projectName);
    }

    async getMetrics(): Promise<Record<string, number>> {
        // Placeholder for metrics retrieval
        return {
            totalTraces: 0,
            avgLatency: 0,
            successRate: 1.0
        };
    }
}

// Singleton instance
export const opikClient = new OpikClient();

export type { TraceOptions, OpikTrace, OpikSpan };
