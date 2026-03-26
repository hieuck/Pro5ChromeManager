import fs from 'fs/promises';
import path from 'path';
import { profileManager } from '../features/profiles/ProfileManager';
import { logger } from '../core/logging/logger';

export interface ManagedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
}

interface RawCookieShape {
  name?: unknown;
  value?: unknown;
  domain?: unknown;
  path?: unknown;
  expires?: unknown;
  expirationDate?: unknown;
  httpOnly?: unknown;
  secure?: unknown;
  sameSite?: unknown;
}

function normalizeSameSite(value: unknown): ManagedCookie['sameSite'] {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'lax') return 'Lax';
  if (normalized === 'none' || normalized === 'no_restriction') return 'None';
  return null;
}

function normalizeExpires(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

export function normalizeCookie(input: RawCookieShape): ManagedCookie {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const value = typeof input.value === 'string' ? input.value : '';
  const domain = typeof input.domain === 'string' ? input.domain.trim() : '';
  const normalizedPath = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : '/';
  const expires = normalizeExpires(input.expires ?? input.expirationDate);

  if (!name) {
    throw new Error('Cookie name is required');
  }
  if (!domain) {
    throw new Error(`Cookie domain is required for ${name}`);
  }

  return {
    name,
    value,
    domain,
    path: normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`,
    expires,
    httpOnly: Boolean(input.httpOnly),
    secure: Boolean(input.secure),
    sameSite: normalizeSameSite(input.sameSite),
  };
}

export class CookieManager {
  private getCookiePath(profileId: string): string {
    const profileDir = profileManager.getProfileDirectory(profileId);
    return path.join(profileDir, 'cookies.json');
  }

  async listCookies(profileId: string): Promise<ManagedCookie[]> {
    const cookiePath = this.getCookiePath(profileId);
    try {
      const raw = await fs.readFile(cookiePath, 'utf-8');
      const parsed = JSON.parse(raw) as RawCookieShape[];
      return parsed.map((cookie) => normalizeCookie(cookie));
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : null;
      if (code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async importCookies(profileId: string, cookies: RawCookieShape[]): Promise<ManagedCookie[]> {
    const normalizedCookies = cookies.map((cookie) => normalizeCookie(cookie));
    const cookiePath = this.getCookiePath(profileId);
    await fs.writeFile(cookiePath, JSON.stringify(normalizedCookies, null, 2), 'utf-8');
    logger.info('Cookie jar updated', { profileId, count: normalizedCookies.length });
    return normalizedCookies;
  }

  async clearCookies(profileId: string): Promise<void> {
    const cookiePath = this.getCookiePath(profileId);
    await fs.rm(cookiePath, { force: true });
    logger.info('Cookie jar cleared', { profileId });
  }
}

export const cookieManager = new CookieManager();
