import fs from 'fs/promises';
import path from 'path';
import { ConfigManager } from '../di/Container';

export interface AppConfig {
  server: {
    host: string;
    port: number;
    cors: boolean;
  };
  database: {
    type: 'sqlite' | 'postgresql';
    connectionString: string;
  };
  features: {
    fingerprinting: boolean;
    proxyManagement: boolean;
    extensionManagement: boolean;
    backup: {
      enabled: boolean;
      intervalHours: number;
      retentionDays: number;
    };
  };
  monitoring: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  paths: {
    dataDir: string;
    profilesDir: string;
    logsDir: string;
    backupsDir: string;
  };
  security: {
    encryptionKey?: string;
    jwtSecret?: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  server: {
    host: '127.0.0.1',
    port: 3210,
    cors: true
  },
  database: {
    type: 'sqlite',
    connectionString: './data/app.db'
  },
  features: {
    fingerprinting: true,
    proxyManagement: true,
    extensionManagement: true,
    backup: {
      enabled: true,
      intervalHours: 24,
      retentionDays: 7
    }
  },
  monitoring: {
    enabled: true,
    logLevel: 'info'
  },
  paths: {
    dataDir: './data',
    profilesDir: './data/profiles',
    logsDir: './data/logs',
    backupsDir: './data/backups'
  },
  security: {
    // Will be loaded from environment or generated
  }
};

export class ConfigManagerImpl implements ConfigManager {
  private config: AppConfig = DEFAULT_CONFIG;
  private configPath: string;
  private loaded = false;

  constructor(configPath?: string) {
    this.configPath = configPath || './data/config.json';
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.configPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to load existing config
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const configFile = await fs.readFile(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configFile);
        this.config = this.mergeConfig(DEFAULT_CONFIG, loadedConfig);
      } else {
        // Create default config file during initialization
        await this.save(true);
      }

      // Override with environment variables
      this.overrideWithEnv();

      // Ensure required directories exist
      await this.ensureDirectories();

      this.loaded = true;
    } catch (error) {
      this.loaded = false; // Ensure clean state on error
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  get<T>(key: string): T {
    if (!this.loaded) {
      throw new Error('Config not loaded. Call load() first.');
    }

    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        throw new Error(`Config key '${key}' not found`);
      }
    }

    return value as T;
  }

  set<T>(key: string, value: T): void {
    if (!this.loaded) {
      throw new Error('Config not loaded. Call load() first.');
    }

    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let target: any = this.config;

    for (const k of keys) {
      if (!(k in target)) {
        target[k] = {};
      }
      target = target[k];
    }

    target[lastKey] = value;
  }

  getAll(): AppConfig {
    if (!this.loaded) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return { ...this.config }; // Return copy to prevent mutation
  }

  async save(allowDuringInit = false): Promise<void> {
    if (!this.loaded && !allowDuringInit) {
      throw new Error('Config not loaded. Call load() first.');
    }

    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private mergeConfig(defaultConfig: any, loadedConfig: any): any {
    const merged: any = { ...defaultConfig };

    for (const key in loadedConfig) {
      if (typeof loadedConfig[key] === 'object' && loadedConfig[key] !== null && !Array.isArray(loadedConfig[key])) {
        merged[key] = this.mergeConfig(defaultConfig[key] || {}, loadedConfig[key]);
      } else {
        merged[key] = loadedConfig[key];
      }
    }

    return merged;
  }

  private overrideWithEnv(): void {
    // Server settings
    if (process.env.SERVER_HOST) this.config.server.host = process.env.SERVER_HOST;
    if (process.env.SERVER_PORT) this.config.server.port = parseInt(process.env.SERVER_PORT, 10);
    if (process.env.CORS_ENABLED) this.config.server.cors = process.env.CORS_ENABLED === 'true';

    // Database settings
    if (process.env.DATABASE_TYPE) this.config.database.type = process.env.DATABASE_TYPE as any;
    if (process.env.DATABASE_URL) this.config.database.connectionString = process.env.DATABASE_URL;

    // Feature toggles
    if (process.env.FINGERPRINTING_ENABLED) this.config.features.fingerprinting = process.env.FINGERPRINTING_ENABLED === 'true';
    if (process.env.PROXY_MANAGEMENT_ENABLED) this.config.features.proxyManagement = process.env.PROXY_MANAGEMENT_ENABLED === 'true';
    if (process.env.BACKUP_ENABLED) this.config.features.backup.enabled = process.env.BACKUP_ENABLED === 'true';

    // Paths
    if (process.env.DATA_DIR) this.config.paths.dataDir = process.env.DATA_DIR;
    if (process.env.PROFILES_DIR) this.config.paths.profilesDir = process.env.PROFILES_DIR;
    if (process.env.LOGS_DIR) this.config.paths.logsDir = process.env.LOGS_DIR;
    if (process.env.BACKUPS_DIR) this.config.paths.backupsDir = process.env.BACKUPS_DIR;

    // Security
    if (process.env.ENCRYPTION_KEY) this.config.security.encryptionKey = process.env.ENCRYPTION_KEY;
    if (process.env.JWT_SECRET) this.config.security.jwtSecret = process.env.JWT_SECRET;
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.paths.dataDir,
      this.config.paths.profilesDir,
      this.config.paths.logsDir,
      this.config.paths.backupsDir
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}