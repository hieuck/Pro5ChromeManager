import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import https from 'https';
import { logger } from '../utils/logger';
import { dataPath } from '../utils/dataPaths';
import { buildContentScriptTemplate } from '../templates/content-script';
import { buildNewTabHtml } from '../templates/new-tab';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface FingerprintConfig {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  canvas: { noise: number; seed: number };
  webgl: { renderer: string; vendor: string; noise: number };
  audio: { noise: number };
  fonts: string[];
  webrtcPolicy: 'default' | 'disable_non_proxied_udp' | 'proxy_only';
}

export interface BrowserIdentityConfig {
  profileId: string;
  profileName: string;
  profileGroup?: string | null;
  profileOwner?: string | null;
}

interface DBData {
  version: string;
  userAgents: { windows: string[]; mac: string[]; linux: string[] };
  webglRenderers: { windows: string[]; mac: string[]; linux: string[] };
  webglVendors: { windows: string[]; mac: string[]; linux: string[] };
  fonts: { windows: string[]; mac: string[]; linux: string[] };
  resolutions: Array<{ width: number; height: number }>;
  timezones: string[];
}

interface DBVersionInfo {
  version: string;
  url: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALID_HARDWARE_CONCURRENCY = [1, 2, 4, 6, 8, 10, 12, 16, 24, 32];
const VALID_DEVICE_MEMORY = [0.25, 0.5, 1, 2, 4, 8];
const DB_PATH = dataPath('fingerprint-db.json');
const DB_VERSION_URL =
  process.env['FINGERPRINT_DB_REPO_URL'] ??
  'https://raw.githubusercontent.com/hieuck/Pro5ChromeManager/main/fingerprint-db-version.json';

// ─── Hardcoded fallback DB ──────────────────────────────────────────────────────

const FALLBACK_DB: DBData = {
  version: '0.0.0',
  userAgents: {
    windows: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
    mac: [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
    linux: [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
  },
  webglRenderers: {
    windows: ['ANGLE (NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)'],
    mac: ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'],
    linux: ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)'],
  },
  webglVendors: {
    windows: ['Google Inc. (NVIDIA)'],
    mac: ['Google Inc. (Apple)'],
    linux: ['Google Inc. (Intel)'],
  },
  fonts: {
    windows: ['Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Verdana'],
    mac: ['Arial', 'Helvetica Neue', 'Georgia', 'Monaco'],
    linux: ['Arial', 'DejaVu Sans', 'Liberation Sans', 'Ubuntu'],
  },
  resolutions: [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ],
  timezones: ['Asia/Ho_Chi_Minh', 'America/New_York', 'Europe/London'],
};

function resolveSeedDbPath(): string | null {
  const electronResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.resolve(process.cwd(), 'data', 'fingerprint-db.json'),
    path.resolve(__dirname, '../../../data/fingerprint-db.json'),
    electronResourcesPath ? path.join(electronResourcesPath, 'resources', 'fingerprint-db.json') : null,
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => {
    try {
      return existsSync(candidate);
    } catch {
      return false;
    }
  }) ?? null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('pickRandom: empty array');
  return item;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Detect OS key from a User-Agent string */
export function detectOsFromUA(ua: string): 'windows' | 'mac' | 'linux' {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  return 'linux';
}

/** Extract platform string from UA */
export function extractPlatformFromUA(ua: string): string {
  const os = detectOsFromUA(ua);
  if (os === 'windows') return 'Win32';
  if (os === 'mac') return 'MacIntel';
  return 'Linux x86_64';
}

// ─── FingerprintDB loader ──────────────────────────────────────────────────────

export class FingerprintDB {
  private data: DBData = FALLBACK_DB;
  private readonly dbPath: string;
  private readonly seedPath: string | null;

  constructor(dbPath = DB_PATH, seedPath: string | null = resolveSeedDbPath()) {
    this.dbPath = dbPath;
    this.seedPath = seedPath;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(raw) as DBData;
      logger.debug('FingerprintDB loaded from disk', { version: this.data.version, path: this.dbPath });
    } catch {
      if (this.seedPath) {
        try {
          const raw = await fs.readFile(this.seedPath, 'utf-8');
          this.data = JSON.parse(raw) as DBData;
          logger.info('FingerprintDB seeded from bundled asset', { version: this.data.version, path: this.seedPath });

          if (this.seedPath !== this.dbPath) {
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            await fs.writeFile(this.dbPath, raw, 'utf-8');
          }
          return;
        } catch {
          // Fall through to hardcoded fallback.
        }
      }

      logger.warn('FingerprintDB file not found or invalid, using fallback defaults');
      this.data = FALLBACK_DB;
    }
  }

  get(): DBData {
    return this.data;
  }
}

// ─── FingerprintEngine ─────────────────────────────────────────────────────────

export class FingerprintEngine {
  private dbLoader: FingerprintDB;
  private db: DBData = FALLBACK_DB;
  private initialized = false;

  constructor(dbLoader?: FingerprintDB) {
    this.dbLoader = dbLoader ?? new FingerprintDB();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.dbLoader.load();
    this.db = this.dbLoader.get();
    this.initialized = true;
  }

  /** Generate a consistent fingerprint from the DB */
  generateFingerprint(): FingerprintConfig {
    const db = this.db;

    // Pick OS first, then derive everything from it for consistency
    const osKeys: Array<'windows' | 'mac' | 'linux'> = ['windows', 'mac', 'linux'];
    const os = pickRandom(osKeys);

    const userAgent = pickRandom(db.userAgents[os]);
    const platform = extractPlatformFromUA(userAgent);
    const vendor = 'Google Inc.';

    const language = 'en-US';
    const languages = ['en-US', 'en'];

    const hardwareConcurrency = pickRandom(VALID_HARDWARE_CONCURRENCY);
    const deviceMemory = pickRandom(VALID_DEVICE_MEMORY);

    const resolution = pickRandom(db.resolutions);
    const screenWidth = resolution.width;
    const screenHeight = resolution.height;
    const colorDepth = 24;

    const timezone = pickRandom(db.timezones);

    const canvasSeed = randomInt(1, 2147483647);
    const canvasNoise = randomFloat(0.0001, 0.001);

    const webglRenderer = pickRandom(db.webglRenderers[os]);
    const webglVendor = pickRandom(db.webglVendors[os]);
    const webglNoise = randomFloat(0.0001, 0.001);

    const audioNoise = randomFloat(0.00001, 0.0001);

    // Pick a subset of fonts for this OS
    const allFonts = db.fonts[os];
    const fontCount = randomInt(Math.min(8, allFonts.length), allFonts.length);
    const fonts = [...allFonts].sort(() => Math.random() - 0.5).slice(0, fontCount);

    return {
      userAgent,
      platform,
      vendor,
      language,
      languages,
      hardwareConcurrency,
      deviceMemory,
      screenWidth,
      screenHeight,
      colorDepth,
      timezone,
      canvas: { noise: canvasNoise, seed: canvasSeed },
      webgl: { renderer: webglRenderer, vendor: webglVendor, noise: webglNoise },
      audio: { noise: audioNoise },
      fonts,
      webrtcPolicy: 'disable_non_proxied_udp',
    };
  }

  /** Generate extension files for a profile and write to {dataDir}/extensions/{profileId}/ */
  async prepareExtension(
    profileId: string,
    fingerprint: FingerprintConfig,
    dataDir: string,
    identity?: Partial<BrowserIdentityConfig>,
  ): Promise<string> {
    const extDir = path.join(dataDir, 'extensions', profileId);
    await fs.mkdir(extDir, { recursive: true });

    const resolvedIdentity = this.buildIdentityConfig(profileId, identity);
    const manifest = this.generateManifest();
    const contentScript = this.generateContentScript(fingerprint, resolvedIdentity);
    const newTabHtml = this.generateNewTabHtml(resolvedIdentity);

    await fs.writeFile(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    await fs.writeFile(path.join(extDir, 'content_script.js'), contentScript, 'utf-8');
    await fs.writeFile(path.join(extDir, 'newtab.html'), newTabHtml, 'utf-8');

    logger.debug('Extension prepared', { profileId, extDir });
    return extDir;
  }

  private generateManifest(): Record<string, unknown> {
    return {
      manifest_version: 3,
      name: 'Fingerprint Injector',
      version: '1.0.0',
      description: 'Injects fingerprint overrides into page context',
      chrome_url_overrides: {
        newtab: 'newtab.html',
      },
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content_script.js'],
          run_at: 'document_start',
          all_frames: true,
          world: 'MAIN',
        },
      ],
    };
  }

  private buildIdentityConfig(
    profileId: string,
    identity?: Partial<BrowserIdentityConfig>,
  ): BrowserIdentityConfig & { accentColor: string; subtitle: string } {
    const profileName = identity?.profileName?.trim() || `Profile ${profileId.slice(0, 8)}`;
    const profileGroup = identity?.profileGroup?.trim() || null;
    const profileOwner = identity?.profileOwner?.trim() || null;
    const subtitleParts = [profileGroup, profileOwner].filter((value): value is string => Boolean(value));

    return {
      profileId,
      profileName,
      profileGroup,
      profileOwner,
      accentColor: this.generateAccentColor(profileId),
      subtitle: subtitleParts.join(' / ') || `ID ${profileId.slice(0, 8)}`,
    };
  }

  private generateAccentColor(seed: string): string {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(index);
      hash |= 0;
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 78% 58%)`;
  }

  private generateContentScript(
    fp: FingerprintConfig,
    identity: BrowserIdentityConfig & { accentColor: string; subtitle: string },
  ): string {
    return buildContentScriptTemplate(fp, identity);
  }

  private generateNewTabHtml(
    identity: BrowserIdentityConfig & { accentColor: string; subtitle: string },
  ): string {
    return buildNewTabHtml(identity);
  }

  /** Background DB version check — called on server startup, fails silently if offline */
  async checkAndUpdateDB(dataDir: string): Promise<void> {
    try {
      const versionInfo = await this.fetchVersionInfo();
      if (!versionInfo) return;

      const currentVersion = this.db.version ?? '0.0.0';
      if (this.compareVersions(versionInfo.version, currentVersion) <= 0) {
        logger.debug('FingerprintDB is up to date', { version: currentVersion });
        return;
      }

      logger.info('FingerprintDB update available', {
        current: currentVersion,
        latest: versionInfo.version,
      });

      await this.downloadAndSaveDB(versionInfo.url, dataDir);
      await this.dbLoader.load();
      this.db = this.dbLoader.get();
      logger.info('FingerprintDB updated', { version: this.db.version });
    } catch (err) {
      // Skip silently if offline or any error
      logger.debug('FingerprintDB version check skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private fetchVersionInfo(): Promise<DBVersionInfo | null> {
    return new Promise((resolve) => {
      const req = https.get(DB_VERSION_URL, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as DBVersionInfo);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private downloadAndSaveDB(url: string, dataDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(dataDir, 'fingerprint-db.json');
      https.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', async () => {
          try {
            JSON.parse(data); // validate JSON
            await fs.writeFile(dbPath, data, 'utf-8');
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }
}

export const fingerprintEngine = new FingerprintEngine();
