import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import https from 'https';
import { logger } from '../utils/logger';
import { dataPath } from '../utils/dataPaths';

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
    const fpJson = JSON.stringify(fp);
    const identityJson = JSON.stringify(identity);
    return `
// Fingerprint Injector — generated content script
// world: MAIN — runs in page context
(function() {
  'use strict';

  const _fp = ${fpJson};
  const _identity = ${identityJson};

  function def(obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, {
        get: function() { return value; },
        configurable: true,
        enumerable: true,
      });
    } catch(e) {}
  }

  // ── navigator overrides ──────────────────────────────────────────────────────
  def(Navigator.prototype, 'userAgent', _fp.userAgent);
  def(Navigator.prototype, 'platform', _fp.platform);
  def(Navigator.prototype, 'vendor', _fp.vendor);
  def(Navigator.prototype, 'language', _fp.language);
  def(Navigator.prototype, 'languages', Object.freeze(_fp.languages));
  def(Navigator.prototype, 'hardwareConcurrency', _fp.hardwareConcurrency);
  def(Navigator.prototype, 'deviceMemory', _fp.deviceMemory);

  // ── screen overrides ─────────────────────────────────────────────────────────
  def(Screen.prototype, 'width', _fp.screenWidth);
  def(Screen.prototype, 'height', _fp.screenHeight);
  def(Screen.prototype, 'availWidth', _fp.screenWidth);
  def(Screen.prototype, 'availHeight', _fp.screenHeight - 40);
  def(Screen.prototype, 'colorDepth', _fp.colorDepth);
  def(Screen.prototype, 'pixelDepth', _fp.colorDepth);

  // ── Canvas noise ─────────────────────────────────────────────────────────────
  const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width || 1, this.height || 1);
      const seed = _fp.canvas.seed;
      const noise = _fp.canvas.noise;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = ((seed * (i + 1)) % 256) / 256;
        imageData.data[i]     = Math.min(255, imageData.data[i]     + Math.floor(r * noise * 255));
        imageData.data[i + 1] = Math.min(255, imageData.data[i + 1] + Math.floor(r * noise * 255));
        imageData.data[i + 2] = Math.min(255, imageData.data[i + 2] + Math.floor(r * noise * 255));
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return _origToDataURL.call(this, type, quality);
  };

  const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const imageData = _origGetImageData.call(this, sx, sy, sw, sh);
    const seed = _fp.canvas.seed;
    const noise = _fp.canvas.noise;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = ((seed * (i + 1)) % 256) / 256;
      imageData.data[i]     = Math.min(255, imageData.data[i]     + Math.floor(r * noise * 255));
      imageData.data[i + 1] = Math.min(255, imageData.data[i + 1] + Math.floor(r * noise * 255));
      imageData.data[i + 2] = Math.min(255, imageData.data[i + 2] + Math.floor(r * noise * 255));
    }
    return imageData;
  };

  // ── WebGL overrides ──────────────────────────────────────────────────────────
  const _origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return _fp.webgl.vendor;    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37446) return _fp.webgl.renderer;  // UNMASKED_RENDERER_WEBGL
    return _origGetParameter.call(this, parameter);
  };

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const _origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return _fp.webgl.vendor;
      if (parameter === 37446) return _fp.webgl.renderer;
      return _origGetParameter2.call(this, parameter);
    };
  }

  // ── AudioContext noise ───────────────────────────────────────────────────────
  const _OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (_OrigAudioContext) {
    const _origCreateOscillator = _OrigAudioContext.prototype.createOscillator;
    _OrigAudioContext.prototype.createOscillator = function() {
      const osc = _origCreateOscillator.call(this);
      const _origConnect = osc.connect.bind(osc);
      osc.connect = function(dest) {
        return _origConnect(dest);
      };
      return osc;
    };
  }

  // ── Timezone override ────────────────────────────────────────────────────────
  const _OrigDateTimeFormat = Intl.DateTimeFormat;
  function PatchedDateTimeFormat(locales, options) {
    if (!options) options = {};
    if (!options.timeZone) options.timeZone = _fp.timezone;
    return new _OrigDateTimeFormat(locales, options);
  }
  PatchedDateTimeFormat.prototype = _OrigDateTimeFormat.prototype;
  PatchedDateTimeFormat.supportedLocalesOf = _OrigDateTimeFormat.supportedLocalesOf;
  try {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      value: PatchedDateTimeFormat,
      configurable: true,
      writable: true,
    });
  } catch(e) {}

  const TITLE_PREFIX = '[' + _identity.profileName + '] ';

  function ensureProfileTitlePrefix() {
    try {
      const currentTitle = document.title || '';
      if (!currentTitle.startsWith(TITLE_PREFIX)) {
        document.title = TITLE_PREFIX + currentTitle;
      }
    } catch(e) {}
  }

  function mountProfileBadge() {
    try {
      if (!document.documentElement) return;
      if (document.getElementById('pro5-profile-identity-badge')) return;

      const root = document.createElement('div');
      root.id = 'pro5-profile-identity-badge';
      root.setAttribute('data-profile-id', _identity.profileId);
      root.innerHTML =
        '<div class="pro5-profile-identity__dot"></div>' +
        '<div class="pro5-profile-identity__body">' +
          '<div class="pro5-profile-identity__name"></div>' +
          '<div class="pro5-profile-identity__meta"></div>' +
        '</div>';

      const style = document.createElement('style');
      style.id = 'pro5-profile-identity-style';
      style.textContent = [
        '#pro5-profile-identity-badge {',
        'position: fixed;',
        'top: 14px;',
        'right: 18px;',
        'z-index: 2147483647;',
        'display: flex;',
        'align-items: center;',
        'gap: 10px;',
        'padding: 9px 12px;',
        'border-radius: 999px;',
        'background: rgba(15, 23, 42, 0.88);',
        'backdrop-filter: blur(10px);',
        'box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);',
        'color: #f8fafc;',
        'font-family: "Segoe UI", Arial, sans-serif;',
        'line-height: 1.15;',
        'pointer-events: none;',
        'max-width: min(52vw, 360px);',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__dot {',
        'width: 12px;',
        'height: 12px;',
        'border-radius: 999px;',
        'flex: 0 0 auto;',
        'background: ' + _identity.accentColor + ';',
        'box-shadow: 0 0 0 3px rgba(255,255,255,0.12);',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__body {',
        'display: flex;',
        'flex-direction: column;',
        'min-width: 0;',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__name {',
        'font-size: 13px;',
        'font-weight: 700;',
        'white-space: nowrap;',
        'overflow: hidden;',
        'text-overflow: ellipsis;',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__meta {',
        'margin-top: 2px;',
        'font-size: 11px;',
        'color: rgba(226, 232, 240, 0.8);',
        'white-space: nowrap;',
        'overflow: hidden;',
        'text-overflow: ellipsis;',
        '}',
        '@media (max-width: 720px) {',
        '#pro5-profile-identity-badge { top: 10px; right: 10px; max-width: calc(100vw - 20px); }',
        '#pro5-profile-identity-badge .pro5-profile-identity__meta { display: none; }',
        '}'
      ].join('');

      root.querySelector('.pro5-profile-identity__name').textContent = _identity.profileName;
      root.querySelector('.pro5-profile-identity__meta').textContent = _identity.subtitle;

      if (!document.getElementById('pro5-profile-identity-style')) {
        document.documentElement.appendChild(style);
      }

      document.documentElement.appendChild(root);
    } catch(e) {}
  }

  function bootIdentityUi() {
    ensureProfileTitlePrefix();
    mountProfileBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootIdentityUi, { once: true });
  } else {
    bootIdentityUi();
  }

  const observer = new MutationObserver(function() {
    ensureProfileTitlePrefix();
    mountProfileBadge();
  });

  try {
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  } catch(e) {}

})();
`.trim();
  }

  private generateNewTabHtml(
    identity: BrowserIdentityConfig & { accentColor: string; subtitle: string },
  ): string {
    const escapedName = this.escapeHtml(identity.profileName);
    const escapedSubtitle = this.escapeHtml(identity.subtitle);
    const escapedId = this.escapeHtml(identity.profileId);
    const accentColor = this.escapeHtml(identity.accentColor);
    const shortId = this.escapeHtml(identity.profileId.slice(0, 8));

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedName} - Pro5 Workspace</title>
    <style>
      :root {
        --accent: ${accentColor};
        --bg: #07111f;
        --panel: rgba(7, 17, 31, 0.72);
        --text: #f8fafc;
        --muted: rgba(226, 232, 240, 0.76);
        --border: rgba(148, 163, 184, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 34%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 28%),
          linear-gradient(180deg, #0f172a 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 28px;
      }
      .shell {
        width: min(920px, 100%);
        border-radius: 28px;
        border: 1px solid var(--border);
        background: var(--panel);
        backdrop-filter: blur(18px);
        box-shadow: 0 28px 90px rgba(2, 6, 23, 0.42);
        overflow: hidden;
      }
      .hero {
        padding: 36px;
        display: grid;
        gap: 18px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 4px rgba(255,255,255,0.08);
      }
      h1 {
        margin: 0;
        font-size: clamp(34px, 7vw, 72px);
        line-height: 0.94;
      }
      .subtitle {
        font-size: 18px;
        color: var(--muted);
        max-width: 56ch;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-top: 6px;
      }
      .meta-card {
        border-radius: 18px;
        padding: 16px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.46);
      }
      .meta-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .meta-value {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
      }
      .hint {
        margin-top: 10px;
        padding: 18px 20px;
        border-radius: 20px;
        border: 1px solid rgba(59, 130, 246, 0.18);
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(15, 23, 42, 0.4));
        color: rgba(241, 245, 249, 0.92);
      }
      .hint strong {
        color: white;
      }
    </style>
  </head>
  <body>
    <main class="shell" id="pro5-profile-newtab" data-profile-id="${escapedId}">
      <section class="hero">
        <div class="eyebrow"><span class="dot"></span> Pro5 profile identity</div>
        <h1>${escapedName}</h1>
        <div class="subtitle">${escapedSubtitle}</div>
        <div class="meta-grid">
          <article class="meta-card">
            <div class="meta-label">Profile ID</div>
            <div class="meta-value">${shortId}</div>
          </article>
          <article class="meta-card">
            <div class="meta-label">Workspace mode</div>
            <div class="meta-value">Isolated browser</div>
          </article>
          <article class="meta-card">
            <div class="meta-label">Recognition</div>
            <div class="meta-value">Always on</div>
          </article>
        </div>
        <div class="hint">
          <strong>You are inside profile ${escapedName}.</strong>
          Keep this window for the matching account, proxy, and session to avoid cross-profile mistakes.
        </div>
      </section>
    </main>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
