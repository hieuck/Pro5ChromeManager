import fs from 'fs/promises';
import path from 'path';
import { decrypt, encrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import type { ProxyConfig } from '../../shared/types';

interface StoredProxy extends Omit<ProxyConfig, 'password'> {
  password?: string;
}

export async function loadStoredProxies(proxiesPath: string): Promise<ProxyConfig[]> {
  try {
    const raw = await fs.readFile(proxiesPath, 'utf-8');
    const stored = JSON.parse(raw) as StoredProxy[];
    return stored.map((item) => ({
      ...item,
      password: item.password ? decrypt(item.password) : undefined,
    }));
  } catch (error) {
    const isNotFound = error instanceof Error && 'code' in (error as NodeJS.ErrnoException)
      && (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isNotFound) {
      logger.warn('ProxyManager: failed to load proxies.json', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}

export async function persistStoredProxies(proxiesPath: string, proxies: ProxyConfig[]): Promise<void> {
  const stored: StoredProxy[] = proxies.map((proxy) => ({
    ...proxy,
    password: proxy.password ? encrypt(proxy.password) : undefined,
  }));

  await fs.mkdir(path.dirname(proxiesPath), { recursive: true });
  await fs.writeFile(proxiesPath, JSON.stringify(stored, null, 2), 'utf-8');
}
