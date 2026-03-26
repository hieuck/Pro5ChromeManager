import fs from 'fs/promises';
import path from 'path';
import { dataPath } from '../core/fs/dataPaths';

export interface UsageMetrics {
  schemaVersion: number;
  profileCreates: number;
  profileImports: number;
  profileLaunches: number;
  sessionChecks: number;
  sessionCheckLoggedIn: number;
  sessionCheckLoggedOut: number;
  sessionCheckErrors: number;
  lastProfileCreatedAt: string | null;
  lastProfileImportedAt: string | null;
  lastProfileLaunchAt: string | null;
  lastSessionCheckAt: string | null;
}

const CURRENT_SCHEMA_VERSION = 1;
const DEFAULT_METRICS_PATH = dataPath('usage-metrics.json');

const DEFAULT_METRICS: UsageMetrics = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profileCreates: 0,
  profileImports: 0,
  profileLaunches: 0,
  sessionChecks: 0,
  sessionCheckLoggedIn: 0,
  sessionCheckLoggedOut: 0,
  sessionCheckErrors: 0,
  lastProfileCreatedAt: null,
  lastProfileImportedAt: null,
  lastProfileLaunchAt: null,
  lastSessionCheckAt: null,
};

function migrateMetrics(raw: Partial<UsageMetrics> | null | undefined): UsageMetrics {
  return {
    ...DEFAULT_METRICS,
    ...(raw ?? {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export class UsageMetricsManager {
  private metrics: UsageMetrics = { ...DEFAULT_METRICS };
  private readonly metricsPath: string;
  private initialized = false;

  constructor(metricsPath?: string) {
    this.metricsPath = metricsPath ?? DEFAULT_METRICS_PATH;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const raw = await fs.readFile(this.metricsPath, 'utf-8');
      this.metrics = migrateMetrics(JSON.parse(raw) as Partial<UsageMetrics>);
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      this.metrics = { ...DEFAULT_METRICS };
      if (!isNotFound) {
        await this.save();
      }
    }

    this.initialized = true;
  }

  getSnapshot(): UsageMetrics {
    return { ...this.metrics };
  }

  async recordProfileCreated(): Promise<void> {
    await this.update((metrics) => ({
      ...metrics,
      profileCreates: metrics.profileCreates + 1,
      lastProfileCreatedAt: new Date().toISOString(),
    }));
  }

  async recordProfileImported(): Promise<void> {
    await this.update((metrics) => ({
      ...metrics,
      profileImports: metrics.profileImports + 1,
      lastProfileImportedAt: new Date().toISOString(),
    }));
  }

  async recordProfileLaunch(): Promise<void> {
    await this.update((metrics) => ({
      ...metrics,
      profileLaunches: metrics.profileLaunches + 1,
      lastProfileLaunchAt: new Date().toISOString(),
    }));
  }

  async recordSessionCheck(result: 'logged_in' | 'logged_out' | 'error'): Promise<void> {
    await this.update((metrics) => ({
      ...metrics,
      sessionChecks: metrics.sessionChecks + 1,
      sessionCheckLoggedIn: metrics.sessionCheckLoggedIn + (result === 'logged_in' ? 1 : 0),
      sessionCheckLoggedOut: metrics.sessionCheckLoggedOut + (result === 'logged_out' ? 1 : 0),
      sessionCheckErrors: metrics.sessionCheckErrors + (result === 'error' ? 1 : 0),
      lastSessionCheckAt: new Date().toISOString(),
    }));
  }

  private async update(
    transform: (metrics: UsageMetrics) => UsageMetrics,
  ): Promise<void> {
    await this.initialize();
    this.metrics = migrateMetrics(transform(this.metrics));
    await this.save();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });
    await fs.writeFile(this.metricsPath, JSON.stringify(this.metrics, null, 2), 'utf-8');
  }
}

export const usageMetricsManager = new UsageMetricsManager();
