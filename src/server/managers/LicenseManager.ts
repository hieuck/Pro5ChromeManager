import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { encrypt, decrypt, getMachineId } from '../utils/crypto';
import { logger } from '../utils/logger';
import { dataPath } from '../utils/dataPaths';

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREE_TIER_LIMIT = 10;
const REVALIDATE_INTERVAL_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;
const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const LICENSE_FILE = dataPath('license.dat');
const DEFAULT_OFFLINE_SECRET = 'pro5-chrome-manager-offline-secret-v1';

// Offline key secret — đổi giá trị này trước khi release production
// Không commit secret thật vào repo — dùng env var PRO5_OFFLINE_SECRET
const OFFLINE_SECRET = process.env['PRO5_OFFLINE_SECRET'] ?? DEFAULT_OFFLINE_SECRET;
const OFFLINE_KEY_PREFIX = 'PRO5-OFFLINE-';

function offlineKeysEnabled(): boolean {
  return process.env['NODE_ENV'] !== 'production' || OFFLINE_SECRET !== DEFAULT_OFFLINE_SECRET;
}

// ─── Schemas ───────────────────────────────────────────────────────────────────

const LicenseStateSchema = z.object({
  licenseKey: z.string(),
  instanceId: z.string(),
  activatedAt: z.string(),
  lastVerifiedAt: z.string(),
  machineId: z.string(),
  valid: z.boolean(),
  offline: z.boolean().optional(), // true = offline key, không cần re-verify
});

type LicenseState = z.infer<typeof LicenseStateSchema>;

// ─── Offline key payload ───────────────────────────────────────────────────────

interface OfflineKeyPayload {
  machineId: string | null; // null = universal key (không lock machine)
  issuedAt: string;
  expiresAt: string | null; // null = lifetime
  tier: 'pro';
}

export type LicenseStatus =
  | { tier: 'free'; profilesUsed: number; profilesLimit: number }
  | { tier: 'pro'; licenseKey: string; activatedAt: string; lastVerifiedAt: string }
  | { tier: 'grace'; licenseKey: string; graceExpiresAt: string; reason: 'machine_changed' | 'server_unreachable' }
  | { tier: 'expired'; licenseKey: string };

// ─── LicenseManager ────────────────────────────────────────────────────────────

export class LicenseManager {
  private state: LicenseState | null = null;
  private machineId: string;
  private licenseFile: string;

  constructor(machineId: string, licenseFile?: string) {
    this.machineId = machineId;
    this.licenseFile = licenseFile ?? LICENSE_FILE;
  }

  async initialize(): Promise<void> {
    try {
      const encrypted = await fs.readFile(this.licenseFile, 'utf-8');
      const json = decrypt(encrypted.trim());
      const parsed = JSON.parse(json) as unknown;
      this.state = LicenseStateSchema.parse(parsed);
      logger.info('LicenseManager: loaded license state');

      // Background re-verify if overdue
      this.scheduleRevalidation();
    } catch (err: unknown) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        logger.warn('LicenseManager: failed to load license.dat, treating as free tier', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.state = null;
    }
  }

  /** Activate a license key — auto-detect offline vs online key */
  async activate(licenseKey: string): Promise<LicenseStatus> {
    if (licenseKey.startsWith(OFFLINE_KEY_PREFIX)) {
      return this.activateOffline(licenseKey);
    }
    return this.activateOnline(licenseKey);
  }

  /** Activate offline key — no network required */
  private async activateOffline(licenseKey: string): Promise<LicenseStatus> {
    if (!offlineKeysEnabled()) {
      throw new Error('Offline key bá»‹ táº¯t trÃªn báº£n production cho Ä‘áº¿n khi cáº¥u hÃ¬nh PRO5_OFFLINE_SECRET.');
    }

    const payload = this.verifyOfflineKey(licenseKey);
    if (!payload) {
      throw new Error('Offline key không hợp lệ hoặc đã bị giả mạo.');
    }

    // Check machine lock
    if (payload.machineId !== null && payload.machineId !== this.machineId) {
      throw new Error('Offline key này được cấp cho máy khác.');
    }

    // Check expiry
    if (payload.expiresAt !== null && new Date() > new Date(payload.expiresAt)) {
      throw new Error('Offline key đã hết hạn.');
    }

    const now = new Date().toISOString();
    this.state = {
      licenseKey,
      instanceId: this.machineId,
      activatedAt: now,
      lastVerifiedAt: now,
      machineId: this.machineId,
      valid: true,
      offline: true,
    };

    await this.persistState();
    logger.info('LicenseManager: offline license activated', { machineId: this.machineId });
    return this.getStatus(0);
  }

  /** Activate online key via LemonSqueezy API */
  private async activateOnline(licenseKey: string): Promise<LicenseStatus> {
    const storeId = process.env['LEMONSQUEEZY_STORE_ID'] ?? '';
    const body = JSON.stringify({
      license_key: licenseKey,
      instance_name: this.machineId,
      store_id: storeId || undefined,
    });

    let apiValid = false;
    let instanceId = '';

    try {
      const res = await fetch(LICENSE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { valid?: boolean; instance?: { id?: string } };
      apiValid = data.valid === true;
      instanceId = data.instance?.id ?? this.machineId;
    } catch (err) {
      logger.error(`[${new Date().toISOString()}]`, 'LicenseManager: activate API error', err);
      throw new Error('Không thể kết nối đến máy chủ license. Vui lòng thử lại.');
    }

    if (!apiValid) {
      throw new Error('License key không hợp lệ hoặc đã hết hạn.');
    }

    const now = new Date().toISOString();
    this.state = {
      licenseKey,
      instanceId,
      activatedAt: now,
      lastVerifiedAt: now,
      machineId: this.machineId,
      valid: true,
    };

    await this.persistState();
    logger.info('LicenseManager: license activated', { licenseKey: this.redact(licenseKey) });
    return this.getStatus(0);
  }

  /** Deactivate — remove local license.dat */
  async deactivate(): Promise<void> {
    this.state = null;
    try {
      await fs.unlink(this.licenseFile);
    } catch {
      // already gone
    }
    logger.info('LicenseManager: license deactivated');
  }

  /** Get current license status */
  getStatus(profilesUsed: number): LicenseStatus {
    if (!this.state) {
      return { tier: 'free', profilesUsed, profilesLimit: FREE_TIER_LIMIT };
    }

    const { licenseKey, activatedAt, lastVerifiedAt, machineId, valid, offline } = this.state;

    if (!valid) {
      return { tier: 'expired', licenseKey };
    }

    // Offline key — không cần re-verify, chỉ check expiry từ payload
    if (offline) {
      const payload = this.verifyOfflineKey(licenseKey);
      if (!payload) return { tier: 'expired', licenseKey };
      if (payload.expiresAt !== null && new Date() > new Date(payload.expiresAt)) {
        return { tier: 'expired', licenseKey };
      }
      return { tier: 'pro', licenseKey, activatedAt, lastVerifiedAt };
    }

    // Machine ID changed → grace period
    if (machineId !== this.machineId) {
      const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
      const graceExpiresAt = new Date(new Date(lastVerifiedAt).getTime() + graceMs).toISOString();
      if (new Date() < new Date(graceExpiresAt)) {
        return { tier: 'grace', licenseKey, graceExpiresAt, reason: 'machine_changed' };
      }
      return { tier: 'expired', licenseKey };
    }

    // Overdue re-verify → grace period
    const revalidateMs = REVALIDATE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const overdueSince = new Date(new Date(lastVerifiedAt).getTime() + revalidateMs);
    if (new Date() > overdueSince) {
      const graceExpiresAt = new Date(overdueSince.getTime() + graceMs).toISOString();
      if (new Date() < new Date(graceExpiresAt)) {
        return { tier: 'grace', licenseKey, graceExpiresAt, reason: 'server_unreachable' };
      }
      return { tier: 'expired', licenseKey };
    }

    return { tier: 'pro', licenseKey, activatedAt, lastVerifiedAt };
  }

  /** Check if creating a new profile is allowed */
  canCreateProfile(profilesUsed: number): boolean {
    const status = this.getStatus(profilesUsed);
    if (status.tier === 'free') return profilesUsed < FREE_TIER_LIMIT;
    return status.tier === 'pro' || status.tier === 'grace';
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async persistState(): Promise<void> {
    if (!this.state) return;
    await fs.mkdir(path.dirname(this.licenseFile), { recursive: true });
    const json = JSON.stringify(this.state);
    const encrypted = encrypt(json);
    await fs.writeFile(this.licenseFile, encrypted, 'utf-8');
  }

  private scheduleRevalidation(): void {
    if (!this.state) return;
    // Offline keys không cần re-verify
    if (this.state.offline) return;
    const revalidateMs = REVALIDATE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(this.state.lastVerifiedAt).getTime();
    if (elapsed < revalidateMs) return;
    void this.revalidateInBackground();
  }

  private async revalidateInBackground(): Promise<void> {
    if (!this.state) return;
    try {
      const body = JSON.stringify({
        license_key: this.state.licenseKey,
        instance_name: this.machineId,
      });
      const res = await fetch(LICENSE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { valid?: boolean };
      this.state = {
        ...this.state,
        valid: data.valid === true,
        lastVerifiedAt: new Date().toISOString(),
        machineId: this.machineId,
      };
      await this.persistState();
      logger.info('LicenseManager: background re-validation complete', { valid: this.state.valid });
    } catch {
      // Offline — keep existing state, grace period logic handles expiry
      logger.warn('LicenseManager: background re-validation failed (offline?)');
    }
  }

  private redact(key: string): string {
    return key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : '****';
  }

  /**
   * Verify offline key signature. Returns payload if valid, null if tampered/invalid.
   * Format: PRO5-OFFLINE-<base64url(payloadJson.hmacHex)>
   */
  private verifyOfflineKey(licenseKey: string): OfflineKeyPayload | null {
    try {
      const encoded = licenseKey.slice(OFFLINE_KEY_PREFIX.length);
      const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
      const dotIdx = decoded.lastIndexOf('.');
      if (dotIdx === -1) return null;

      const payloadJson = decoded.slice(0, dotIdx);
      const providedHmac = decoded.slice(dotIdx + 1);

      const expectedHmac = crypto
        .createHmac('sha256', OFFLINE_SECRET)
        .update(payloadJson)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      if (!crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) {
        return null;
      }

      return JSON.parse(payloadJson) as OfflineKeyPayload;
    } catch {
      return null;
    }
  }

  /**
   * Generate an offline license key.
   * Call this from a separate admin CLI tool — not exposed via API.
   *
   * @param machineId - null for universal key, specific ID to lock to one machine
   * @param expiresAt - null for lifetime, ISO string for expiry
   */
  static generateOfflineKey(
    machineId: string | null = null,
    expiresAt: string | null = null,
    secret: string = OFFLINE_SECRET,
  ): string {
    if (process.env['NODE_ENV'] === 'production' && secret === DEFAULT_OFFLINE_SECRET) {
      throw new Error('Offline key generation requires PRO5_OFFLINE_SECRET in production.');
    }

    const payload: OfflineKeyPayload = {
      machineId,
      issuedAt: new Date().toISOString(),
      expiresAt,
      tier: 'pro',
    };
    const payloadJson = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret).update(payloadJson).digest('hex');
    const encoded = Buffer.from(`${payloadJson}.${hmac}`).toString('base64url');
    return `${OFFLINE_KEY_PREFIX}${encoded}`;
  }
}

export const licenseManager = new LicenseManager(getMachineId());
