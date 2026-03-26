import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { dataPath } from '../core/fs/dataPaths';

export interface SupportFeedbackEntry {
  id: string;
  createdAt: string;
  category: 'bug' | 'feedback' | 'question';
  sentiment: 'negative' | 'neutral' | 'positive';
  message: string;
  email: string | null;
  appVersion: string | null;
}

const DEFAULT_FEEDBACK_PATH = dataPath('support-feedback.json');

export class SupportInboxManager {
  private readonly feedbackPath: string;

  constructor(feedbackPath?: string) {
    this.feedbackPath = feedbackPath ?? DEFAULT_FEEDBACK_PATH;
  }

  async listFeedback(limit = 20): Promise<SupportFeedbackEntry[]> {
    const entries = await this.load();
    return entries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async createFeedback(
    input: Omit<SupportFeedbackEntry, 'id' | 'createdAt'>,
  ): Promise<SupportFeedbackEntry> {
    const entries = await this.load();
    const entry: SupportFeedbackEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      category: input.category,
      sentiment: input.sentiment,
      message: input.message.trim(),
      email: input.email?.trim() ? input.email.trim() : null,
      appVersion: input.appVersion?.trim() ? input.appVersion.trim() : null,
    };
    entries.push(entry);
    await this.save(entries);
    return entry;
  }

  private async load(): Promise<SupportFeedbackEntry[]> {
    try {
      const raw = await fs.readFile(this.feedbackPath, 'utf-8');
      const parsed = JSON.parse(raw) as SupportFeedbackEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (isNotFound) return [];
      throw err;
    }
  }

  private async save(entries: SupportFeedbackEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(this.feedbackPath), { recursive: true });
    await fs.writeFile(this.feedbackPath, JSON.stringify(entries, null, 2), 'utf-8');
  }
}

export const supportInboxManager = new SupportInboxManager();
