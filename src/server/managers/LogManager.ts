import fs from 'fs/promises';
import path from 'path';
import { dataPath } from '../utils/dataPaths';

export type OpsLogEntry = {
  timestamp: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string | null;
  raw: string;
};

export class LogManager {
  private getLogTimestamp(line: string): number {
    try {
      const parsed = JSON.parse(line) as { timestamp?: unknown };
      if (typeof parsed.timestamp === 'string') {
        const timestamp = new Date(parsed.timestamp).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
      }
    } catch {
      const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
      if (match?.[1]) {
        const timestamp = new Date(match[1]).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
      }
    }
    return 0;
  }

  private injectLogSource(line: string, source: string): string {
    const trimmed = line.trim();
    if (!trimmed) return '';

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return JSON.stringify({
        ...parsed,
        source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : source,
      });
    } catch {
      return JSON.stringify({
        timestamp: null,
        level: 'info',
        message: trimmed,
        source,
        raw: trimmed,
      });
    }
  }

  private normalizeLogLevel(value: unknown): OpsLogEntry['level'] {
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if (normalized === 'debug') return 'debug';
    if (normalized === 'error') return 'error';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    return 'info';
  }

  private parseOpsLogEntry(line: string): OpsLogEntry {
    const trimmed = line.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const message =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message
          : typeof parsed.msg === 'string' && parsed.msg.trim()
            ? parsed.msg
            : trimmed;

      return {
        timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : null,
        level: this.normalizeLogLevel(parsed.level),
        message,
        source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : null,
        raw: trimmed,
      };
    } catch {
      return {
        timestamp: null,
        level: 'info',
        message: trimmed,
        source: null,
        raw: trimmed,
      };
    }
  }

  async loadOpsLogEntries(limit: number): Promise<OpsLogEntry[]> {
    const logDir = dataPath('logs');

    try {
      const files = await fs.readdir(logDir);
      const relevantFiles = files.filter((file) =>
        file === 'electron-main.log' ||
        file.startsWith('exceptions-') ||
        file.startsWith('rejections-') ||
        /^app-\d{4}-\d{2}-\d{2}\.log$/.test(file),
      );

      const entries: Array<{ entry: OpsLogEntry; timestamp: number }> = [];

      for (const file of relevantFiles) {
        try {
          const content = await fs.readFile(path.join(logDir, file), 'utf-8');
          const lines = content.split(/\r?\n/).filter(Boolean).slice(-200);
          for (const line of lines) {
            const normalized = this.injectLogSource(line, file);
            if (!normalized) continue;
            entries.push({
              entry: this.parseOpsLogEntry(normalized),
              timestamp: this.getLogTimestamp(normalized),
            });
          }
        } catch { /* skip unreadable files */ }
      }

      return entries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
        .map((entry) => entry.entry);
    } catch {
      return [];
    }
  }
}

export const logManager = new LogManager();
