import fs from 'fs/promises';
import { configManager } from '../config/ConfigManager';
import { logger } from '../../core/logging/logger';
import { NotFoundError, ValidationError } from '../../core/errors';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Runtime {
  key: string;
  label: string;
  executablePath: string;
  available: boolean;
}

// ─── Auto-select priority order ───────────────────────────────────────────────

const AUTO_SELECT_ORDER = ['centbrowser', 'chrome', 'chromium', 'msedge'] as const;

// ─── RuntimeManager ───────────────────────────────────────────────────────────

export class RuntimeManager {
  private runtimes: Map<string, Runtime> = new Map();
  /** Injectable file-access checker — override in tests */
  private readonly accessFn: (p: string) => Promise<void>;

  constructor(accessFn?: (p: string) => Promise<void>) {
    this.accessFn = accessFn ?? ((p) => fs.access(p));
  }

  async initialize(): Promise<void> {
    const configRuntimes = configManager.get().runtimes;
    this.runtimes.clear();

    for (const [key, def] of Object.entries(configRuntimes)) {
      const available = await this.checkAvailability(def.executablePath);
      this.runtimes.set(key, { key, label: def.label, executablePath: def.executablePath, available });
    }

    logger.info('RuntimeManager initialized', {
      total: this.runtimes.size,
      available: Array.from(this.runtimes.values()).filter((r) => r.available).length,
    });
  }

  /** Check if an executable path exists and is accessible */
  async checkAvailability(executablePath: string): Promise<boolean> {
    try {
      await this.accessFn(executablePath);
      return true;
    } catch {
      return false;
    }
  }

  async resolveRuntime(key: string): Promise<string> {
    if (key === 'auto') {
      for (const priorityKey of AUTO_SELECT_ORDER) {
        const runtime = this.runtimes.get(priorityKey);
        if (runtime?.available) {
          logger.debug('Auto-selected runtime', { key: priorityKey, path: runtime.executablePath });
          return runtime.executablePath;
        }
      }
      for (const runtime of this.runtimes.values()) {
        if (runtime.available) {
          logger.debug('Auto-selected runtime (fallback)', { key: runtime.key, path: runtime.executablePath });
          return runtime.executablePath;
        }
      }
      throw new ValidationError('No available runtime found', {
        field: 'runtime',
        value: 'auto',
      });
    }

    const runtime = this.runtimes.get(key);
    if (!runtime) throw new NotFoundError('Runtime', key);

    const available = await this.checkAvailability(runtime.executablePath);
    if (!available) throw new ValidationError(`Runtime not available: ${key} (${runtime.executablePath})`, {
      field: 'runtime',
      value: key,
    });

    return runtime.executablePath;
  }

  listRuntimes(): Runtime[] {
    return Array.from(this.runtimes.values());
  }

  getRuntime(key: string): Runtime | undefined {
    return this.runtimes.get(key);
  }

  async upsertRuntime(key: string, label: string, executablePath: string): Promise<Runtime> {
    const available = await this.checkAvailability(executablePath);
    const runtime: Runtime = { key, label, executablePath, available };
    this.runtimes.set(key, runtime);

    const current = configManager.get().runtimes;
    await configManager.update({ runtimes: { ...current, [key]: { label, executablePath } } });

    logger.info('Runtime upserted', { key, executablePath, available });
    return runtime;
  }

  async deleteRuntime(key: string): Promise<void> {
    if (!this.runtimes.has(key)) throw new NotFoundError('Runtime', key);
    this.runtimes.delete(key);

    const current = { ...configManager.get().runtimes };
    delete current[key];
    await configManager.update({ runtimes: current });

    logger.info('Runtime deleted', { key });
  }

  async refreshAvailability(): Promise<void> {
    for (const [key, runtime] of this.runtimes.entries()) {
      const available = await this.checkAvailability(runtime.executablePath);
      this.runtimes.set(key, { ...runtime, available });
    }
  }
}

export const runtimeManager = new RuntimeManager();
