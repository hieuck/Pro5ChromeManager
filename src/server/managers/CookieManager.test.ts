import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieManager, normalizeCookie } from './CookieManager';
import { profileManager } from './ProfileManager';

describe('CookieManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes cookies from common browser export formats', () => {
    expect(normalizeCookie({
      name: 'session',
      value: 'abc',
      domain: '.example.com',
      expirationDate: 1_900_000_000,
      sameSite: 'no_restriction',
      secure: true,
      httpOnly: true,
    })).toEqual({
      name: 'session',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      expires: 1_900_000_000,
      sameSite: 'None',
      secure: true,
      httpOnly: true,
    });
  });

  it('persists and clears cookies per profile', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-cookie-manager-'));
    const profileDir = path.join(tmpDir, 'profile-a');
    await fs.mkdir(profileDir, { recursive: true });
    vi.spyOn(profileManager, 'getProfileDirectory').mockReturnValue(profileDir);

    const manager = new CookieManager();
    const saved = await manager.importCookies('profile-a', [
      {
        name: 'remember_me',
        value: 'yes',
        domain: 'example.com',
      },
    ]);

    expect(saved).toHaveLength(1);
    await expect(manager.listCookies('profile-a')).resolves.toEqual(saved);

    await manager.clearCookies('profile-a');
    await expect(manager.listCookies('profile-a')).resolves.toEqual([]);
  });
});
