import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { dataPath, resolveAppPath } from '../utils/dataPaths';

// Zod schema for AppConfig
export const RuntimeSchema = z.object({
  label: z.string(),
  executablePath: z.string(),
});

const CURRENT_CONFIG_VERSION = 1;

export const AppConfigSchema = z.object({
  configVersion: z.number().int().default(CURRENT_CONFIG_VERSION),
  onboardingCompleted: z.boolean().default(false),
  uiLanguage: z.enum(['vi', 'en']).default('vi'),
  locale: z.string().default('vi-VN'),
  timezoneId: z.string().default('Asia/Saigon'),
  defaultRuntime: z.string().default('auto'),
  headless: z.boolean().default(false),
  windowTitleSuffixEnabled: z.boolean().default(true),
  profilesDir: z.string().default(dataPath('profiles')),
  api: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(3210),
  }).default({}),
  sessionCheck: z.object({
    enabledByDefault: z.boolean().default(false),
    headless: z.boolean().default(true),
    timeoutMs: z.number().int().positive().default(30000),
  }).default({}),
  runtimes: z.record(z.string(), RuntimeSchema).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const DEFAULT_CONFIG_PATH = dataPath('config.json');

// Migration: upgrade old config shapes to current version
export function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.configVersion === 'number' ? raw.configVersion : 0;
  let config = { ...raw };
  // v0 → v1: add configVersion + onboardingCompleted
  if (version < 1) {
    config = { configVersion: 1, onboardingCompleted: false, ...config };
  }
  if (typeof config['profilesDir'] === 'string') {
    config['profilesDir'] = resolveAppPath(config['profilesDir']);
  }
  return config;
}

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CURRENT_CONFIG_VERSION,
  onboardingCompleted: false,
  uiLanguage: 'vi',
  locale: 'vi-VN',
  timezoneId: 'Asia/Saigon',
  defaultRuntime: 'auto',
  headless: false,
  windowTitleSuffixEnabled: true,
  profilesDir: dataPath('profiles'),
  api: { host: '127.0.0.1', port: 3210 },
  sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
  runtimes: {
    chrome: {
      label: 'Google Chrome',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
};

export class ConfigManager {
  private config: AppConfig = { ...DEFAULT_CONFIG };
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? DEFAULT_CONFIG_PATH;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const migrated = migrateConfig(parsed);
      this.config = AppConfigSchema.parse(migrated);
    } catch (err: unknown) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (isNotFound) {
        this.config = { ...DEFAULT_CONFIG };
        await this.save();
      } else {
        throw err;
      }
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): AppConfig {
    return this.config;
  }

  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    const normalizedPartial = {
      ...partial,
      profilesDir: partial.profilesDir ? resolveAppPath(partial.profilesDir) : undefined,
    };
    const merged = { ...this.config, ...normalizedPartial };
    this.config = AppConfigSchema.parse(merged);
    await this.save();
    return this.config;
  }
}

export const configManager = new ConfigManager();
