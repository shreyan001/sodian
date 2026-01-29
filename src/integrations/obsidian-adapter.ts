/**
 * Obsidian Adapter
 * 
 * Optional integration for syncing with Obsidian vaults
 */

import { promises as fs } from 'fs';
import path from 'path';
import { opikClient } from '../lib/opik-client.js';

interface ObsidianNote {
    path: string;
    filename: string;
    content: string;
    frontmatter: Record<string, unknown>;
    links: string[];
    tags: string[];
    createdAt: Date;
    modifiedAt: Date;
}

interface VaultStats {
    noteCount: number;
    linkCount: number;
    tagCount: number;
    orphanCount: number;
}

export class ObsidianAdapter {
    private vaultPath: string | null = null;

    constructor(vaultPath?: string) {
        this.vaultPath = vaultPath || process.env.OBSIDIAN_VAULT_PATH || null;
    }

    /**
     * Set vault path
     */
    setVaultPath(vaultPath: string): void {
        this.vaultPath = vaultPath;
    }

    /**
     * Read all notes from vault
     */
    async readVault(): Promise<ObsidianNote[]> {
        if (!this.vaultPath) {
            throw new Error('Vault path not configured');
        }

        const trace = opikClient.trace({
            name: 'Obsidian_Read_Vault',
            input: { vaultPath: this.vaultPath },
            metadata: { operation: 'read_vault' }
        });

        try {
            const notes: ObsidianNote[] = [];
            await this.walkDirectory(this.vaultPath, notes);

            trace.end({ output: { noteCount: notes.length } });
            return notes;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Read failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    private async walkDirectory(dir: string, notes: ObsidianNote[]): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip hidden files and folders
            if (entry.name.startsWith('.')) continue;

            if (entry.isDirectory()) {
                await this.walkDirectory(fullPath, notes);
            } else if (entry.name.endsWith('.md')) {
                const note = await this.parseNote(fullPath);
                notes.push(note);
            }
        }
    }

    /**
     * Parse a single note
     */
    async parseNote(notePath: string): Promise<ObsidianNote> {
        const content = await fs.readFile(notePath, 'utf-8');
        const stats = await fs.stat(notePath);

        const { frontmatter, body } = this.parseFrontmatter(content);
        const links = this.extractWikiLinks(body);
        const tags = this.extractTags(body);

        return {
            path: notePath,
            filename: path.basename(notePath, '.md'),
            content: body,
            frontmatter,
            links,
            tags,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    }

    /**
     * Parse YAML frontmatter
     */
    private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
        const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
        const match = content.match(frontmatterRegex);

        if (!match) {
            return { frontmatter: {}, body: content };
        }

        const frontmatterContent = match[1];
        const body = content.slice(match[0].length);

        // Simple YAML parsing
        const frontmatter: Record<string, unknown> = {};
        const lines = frontmatterContent.split('\n');

        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.slice(0, colonIndex).trim();
                const value = line.slice(colonIndex + 1).trim();
                frontmatter[key] = value;
            }
        }

        return { frontmatter, body };
    }

    /**
     * Extract [[wiki links]] from content
     */
    private extractWikiLinks(content: string): string[] {
        const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        const links: string[] = [];
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
            links.push(match[1]);
        }

        return [...new Set(links)];
    }

    /**
     * Extract #tags from content
     */
    private extractTags(content: string): string[] {
        const tagRegex = /#([a-zA-Z0-9_/-]+)/g;
        const tags: string[] = [];
        let match;

        while ((match = tagRegex.exec(content)) !== null) {
            // Exclude markdown headers
            const contextStart = Math.max(0, match.index - 1);
            if (content[contextStart] !== '\n' && content[contextStart] !== ' ' && contextStart !== 0) {
                continue;
            }
            tags.push(match[1]);
        }

        return [...new Set(tags)];
    }

    /**
     * Write a note to the vault
     */
    async writeNote(
        folder: string,
        filename: string,
        content: string,
        frontmatter?: Record<string, unknown>
    ): Promise<string> {
        if (!this.vaultPath) {
            throw new Error('Vault path not configured');
        }

        const trace = opikClient.trace({
            name: 'Obsidian_Write_Note',
            input: { folder, filename },
            metadata: { operation: 'write_note' }
        });

        try {
            const folderPath = path.join(this.vaultPath, folder);
            const notePath = path.join(folderPath, `${filename}.md`);

            // Ensure folder exists
            await fs.mkdir(folderPath, { recursive: true });

            // Build note content
            let noteContent = '';
            if (frontmatter && Object.keys(frontmatter).length > 0) {
                noteContent += '---\n';
                for (const [key, value] of Object.entries(frontmatter)) {
                    noteContent += `${key}: ${value}\n`;
                }
                noteContent += '---\n\n';
            }
            noteContent += content;

            await fs.writeFile(notePath, noteContent, 'utf-8');

            trace.end({ output: { path: notePath } });
            return notePath;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Write failed';
            trace.end({ output: { error: errorMsg } });
            throw error;
        }
    }

    /**
     * Get vault statistics
     */
    async getStats(): Promise<VaultStats> {
        const notes = await this.readVault();

        const allLinks = notes.flatMap(n => n.links);
        const allTags = notes.flatMap(n => n.tags);
        const linkedNotes = new Set(allLinks);
        const orphans = notes.filter(n =>
            !linkedNotes.has(n.filename) && n.links.length === 0
        );

        return {
            noteCount: notes.length,
            linkCount: allLinks.length,
            tagCount: new Set(allTags).size,
            orphanCount: orphans.length
        };
    }
}

export const obsidianAdapter = new ObsidianAdapter();
