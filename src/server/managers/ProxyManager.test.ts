import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { ProxyManager } from './ProxyManager';
import { encrypt, decrypt } from '../utils/crypto';

// ─── P7: Password Encryption ──────────────────────────────────────────────────
// Validates: Requirements 8.2 — proxy passwords must be stored encrypted

describe('P7 — Proxy password encryption', () => {
  it('encrypted value is not equal to plaintext', () => {
    const plaintext = 'my-secret-password-123';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);
  });

  it('decrypt(encrypt(x)) === x (round-trip)', () => {
    const passwords = ['simple', 'p@$$w0rd!', 'unicode-密码', ''];
    for (const pw of passwords) {
      expect(decrypt(encrypt(pw))).toBe(pw);
    }
  });

  it('two encryptions of same plaintext produce different ciphertexts (random IV)', () => {
    const plaintext = 'same-password';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    // Different IVs → different ciphertexts
    expect(c1).not.toBe(c2);
    // But both decrypt to same value
    expect(decrypt(c1)).toBe(plaintext);
    expect(decrypt(c2)).toBe(plaintext);
  });

  it('passwords are stored encrypted in proxies.json', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-test-'));
    const proxiesPath = path.join(tmpDir, 'proxies.json');
    const manager = new ProxyManager(proxiesPath);

    const plainPassword = 'super-secret-proxy-pass';
    await manager.createProxy({
      type: 'http',
      host: '1.2.3.4',
      port: 8080,
      username: 'user',
      password: plainPassword,
    });

    // Read raw file
    const raw = await fs.readFile(proxiesPath, 'utf-8');
    const stored = JSON.parse(raw) as Array<{ password?: string }>;

    expect(stored.length).toBe(1);
    // Password in file must NOT be plaintext
    expect(stored[0]?.password).toBeDefined();
    expect(stored[0]?.password).not.toBe(plainPassword);

    // But after loading, it should decrypt back
    const manager2 = new ProxyManager(proxiesPath);
    await manager2.initialize();
    const proxies = manager2.listProxies();
    expect(proxies[0]?.password).toBe(plainPassword);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ─── buildProxyConfig output format ──────────────────────────────────────────

describe('buildProxyConfig output format', () => {
  let manager: ProxyManager;

  beforeEach(() => {
    manager = new ProxyManager();
  });

  it('HTTP proxy → --proxy-server=http://host:port, no cleanup', async () => {
    const result = await manager.buildProxyConfig({
      id: 'test-1',
      type: 'http',
      host: '10.0.0.1',
      port: 3128,
    });
    expect(result.flag).toBe('--proxy-server=http://10.0.0.1:3128');
    expect(result.cleanup).toBeNull();
  });

  it('HTTPS proxy → --proxy-server=http://host:port, no cleanup', async () => {
    const result = await manager.buildProxyConfig({
      id: 'test-2',
      type: 'https',
      host: 'proxy.example.com',
      port: 443,
    });
    expect(result.flag).toBe('--proxy-server=http://proxy.example.com:443');
    expect(result.cleanup).toBeNull();
  });

  it('SOCKS4 proxy → --proxy-server=socks4://host:port, no cleanup', async () => {
    const result = await manager.buildProxyConfig({
      id: 'test-3',
      type: 'socks4',
      host: '192.168.1.1',
      port: 1080,
    });
    expect(result.flag).toBe('--proxy-server=socks4://192.168.1.1:1080');
    expect(result.cleanup).toBeNull();
  });

  it('SOCKS5 without auth → --proxy-server=socks5://host:port, no cleanup', async () => {
    const result = await manager.buildProxyConfig({
      id: 'test-4',
      type: 'socks5',
      host: '10.10.10.10',
      port: 1080,
    });
    expect(result.flag).toBe('--proxy-server=socks5://10.10.10.10:1080');
    expect(result.cleanup).toBeNull();
  });

  it('SOCKS5 with auth → uses proxy-chain local forwarder, flag points to 127.0.0.1', async () => {
    const result = await manager.buildProxyConfig({
      id: 'test-5',
      type: 'socks5',
      host: '10.10.10.10',
      port: 1080,
      username: 'user',
      password: 'pass',
    });
    expect(result.flag).toMatch(/^--proxy-server=socks5:\/\/127\.0\.0\.1:\d+$/);
    expect(typeof result.cleanup).toBe('function');
    // Cleanup the forwarder
    if (result.cleanup) result.cleanup();
  });
});

// ─── CRUD operations ──────────────────────────────────────────────────────────

describe('ProxyManager CRUD', () => {
  it('create, list, update, delete proxy', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-crud-'));
    const manager = new ProxyManager(path.join(tmpDir, 'proxies.json'));

    const proxy = await manager.createProxy({ type: 'http', host: 'a.b.c', port: 8080 });
    expect(proxy.id).toBeTruthy();
    expect(manager.listProxies()).toHaveLength(1);

    const updated = await manager.updateProxy(proxy.id, { port: 9090 });
    expect(updated.port).toBe(9090);

    await manager.deleteProxy(proxy.id);
    expect(manager.listProxies()).toHaveLength(0);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws when updating non-existent proxy', async () => {
    const manager = new ProxyManager();
    await expect(manager.updateProxy('no-such-id', { port: 1 })).rejects.toThrow('not found');
  });
});
