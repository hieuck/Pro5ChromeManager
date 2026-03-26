/**
 * Unit tests for ConfigManager
 * Validates: Requirements P8 (Config Round-Trip)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  ConfigManager,
  AppConfigSchema,
  AppConfig,
  DEFAULT_CONFIG,
  migrateConfig,
} from './ConfigManager';
import { supportedLanguages } from '../../../shared/i18n/locales';

async function makeTempPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  return path.join(dir, 'config.json');
}

describe('ConfigManager', () => {
  let tmpPath: string;

  beforeEach(async () => {
    tmpPath = await makeTempPath();
  });

  afterEach(async () => {
    await fs.rm(path.dirname(tmpPath), { recursive: true, force: true });
  });

  // ─── P8: Config Round-Trip ───────────────────────────────────────────────

  describe('P8: Config Round-Trip', () => {
    it('schema accepts every supported UI language from the shared locale registry', () => {
      for (const language of supportedLanguages) {
        const parsed = AppConfigSchema.parse({ uiLanguage: language });
        expect(parsed.uiLanguage).toBe(language);
      }
    });

    it('parse → serialize → parse lại phải cho kết quả tương đương (default config)', async () => {
      const manager = new ConfigManager(tmpPath);
      await manager.load(); // creates default + saves

      const first = manager.get();
      const raw = await fs.readFile(tmpPath, 'utf-8');
      const second = AppConfigSchema.parse(JSON.parse(raw));

      expect(second).toEqual(first);
    });

    it('parse → serialize → parse lại với config đầy đủ', () => {
      const fullConfig: AppConfig = {
        configVersion: 1,
        onboardingCompleted: true,
        uiLanguage: 'en',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        defaultRuntime: 'chrome',
        headless: true,
        windowTitleSuffixEnabled: false,
        profilesDir: './data/profiles',
        api: { host: '127.0.0.1', port: 3210 },
        sessionCheck: { enabledByDefault: true, headless: false, timeoutMs: 15000 },
        runtimes: {
          chrome: { label: 'Google Chrome', executablePath: '/usr/bin/google-chrome' },
          edge: { label: 'Microsoft Edge', executablePath: '/usr/bin/msedge' },
        },
      };

      const serialized = JSON.stringify(fullConfig);
      const reparsed = AppConfigSchema.parse(JSON.parse(serialized));

      expect(reparsed).toEqual(fullConfig);
    });

    it('round-trip giữ nguyên tất cả fields sau update()', async () => {
      const manager = new ConfigManager(tmpPath);
      await manager.load();

      const updated = await manager.update({
        uiLanguage: 'en',
        onboardingCompleted: true,
        headless: true,
      });

      const raw = await fs.readFile(tmpPath, 'utf-8');
      const fromDisk = AppConfigSchema.parse(JSON.parse(raw));

      expect(fromDisk).toEqual(updated);
      expect(fromDisk.uiLanguage).toBe('en');
      expect(fromDisk.onboardingCompleted).toBe(true);
      expect(fromDisk.headless).toBe(true);
    });
  });

  // ─── migrateConfig() ─────────────────────────────────────────────────────

  describe('migrateConfig()', () => {
    it('v0 config (không có configVersion) phải thêm configVersion=1 và onboardingCompleted=false', () => {
      const v0: Record<string, unknown> = {
        uiLanguage: 'vi',
        locale: 'vi-VN',
        timezoneId: 'Asia/Saigon',
        defaultRuntime: 'auto',
        headless: false,
        windowTitleSuffixEnabled: true,
        profilesDir: './data/profiles',
        api: { host: '127.0.0.1', port: 3210 },
        sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
        runtimes: {},
      };

      const result = migrateConfig(v0);

      expect(result.configVersion).toBe(1);
      expect(result.onboardingCompleted).toBe(false);
    });

    it('v0 config với onboardingCompleted=true đã có — giữ nguyên giá trị', () => {
      const v0: Record<string, unknown> = {
        uiLanguage: 'vi',
        locale: 'vi-VN',
        timezoneId: 'Asia/Saigon',
        defaultRuntime: 'auto',
        headless: false,
        windowTitleSuffixEnabled: true,
        profilesDir: './data/profiles',
        api: { host: '127.0.0.1', port: 3210 },
        sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
        runtimes: {},
        onboardingCompleted: true,
      };

      const result = migrateConfig(v0);

      expect(result.configVersion).toBe(1);
      // spread order: { configVersion:1, onboardingCompleted:false, ...v0 }
      // v0.onboardingCompleted=true overrides the default false
      expect(result.onboardingCompleted).toBe(true);
    });

    it('config đã có configVersion=1 không bị thay đổi', () => {
      const v1: Record<string, unknown> = {
        configVersion: 1,
        onboardingCompleted: true,
        uiLanguage: 'en',
      };

      const result = migrateConfig(v1);

      expect(result.configVersion).toBe(1);
      expect(result.onboardingCompleted).toBe(true);
      expect(result.uiLanguage).toBe('en');
    });

    it('load() với v0 file phải thêm configVersion=1 và onboardingCompleted=false', async () => {
      const v0Config = {
        uiLanguage: 'vi',
        locale: 'vi-VN',
        timezoneId: 'Asia/Saigon',
        defaultRuntime: 'auto',
        headless: false,
        windowTitleSuffixEnabled: true,
        profilesDir: './data/profiles',
        api: { host: '127.0.0.1', port: 3210 },
        sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
        runtimes: {},
      };

      await fs.writeFile(tmpPath, JSON.stringify(v0Config), 'utf-8');

      const manager = new ConfigManager(tmpPath);
      await manager.load();
      const config = manager.get();

      expect(config.configVersion).toBe(1);
      expect(config.onboardingCompleted).toBe(false);
    });
  });

  // ─── load() với file không tồn tại ───────────────────────────────────────

  describe('load() với file không tồn tại', () => {
    it('phải tạo file với default config', async () => {
      const manager = new ConfigManager(tmpPath);
      await manager.load();

      const exists = await fs.access(tmpPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const raw = await fs.readFile(tmpPath, 'utf-8');
      const parsed = JSON.parse(raw) as AppConfig;
      expect(parsed.configVersion).toBe(1);
      expect(parsed.onboardingCompleted).toBe(false);
      expect(parsed.uiLanguage).toBe('vi');
      expect(parsed.api.port).toBe(3210);
    });

    it('get() sau load() trả về default config', async () => {
      const manager = new ConfigManager(tmpPath);
      await manager.load();
      const config = manager.get();

      expect(config.configVersion).toBe(DEFAULT_CONFIG.configVersion);
      expect(config.onboardingCompleted).toBe(DEFAULT_CONFIG.onboardingCompleted);
      expect(config.uiLanguage).toBe(DEFAULT_CONFIG.uiLanguage);
      expect(config.locale).toBe(DEFAULT_CONFIG.locale);
      expect(config.timezoneId).toBe(DEFAULT_CONFIG.timezoneId);
      expect(config.api.host).toBe(DEFAULT_CONFIG.api.host);
      expect(config.api.port).toBe(DEFAULT_CONFIG.api.port);
    });
  });
});
