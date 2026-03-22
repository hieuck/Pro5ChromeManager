import fs from 'fs/promises';
import https from 'https';
import http from 'http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as ProxyChain from 'proxy-chain';
import { encrypt, decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';
import type { ProxyConfig } from './ProfileManager';
import { dataPath } from '../utils/dataPaths';

export type { ProxyConfig };

// ─── Internal storage shape (password encrypted) ──────────────────────────────

interface StoredProxy extends Omit<ProxyConfig, 'password'> {
  password?: string; // encrypted
}

// ─── buildProxyConfig result ──────────────────────────────────────────────────

export interface ProxyBuildResult {
  flag: string;
  cleanup: (() => void) | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROXIES_PATH = dataPath('proxies.json');

function httpGet(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function httpGetViaProxy(targetUrl: string, proxy: ProxyConfig, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proxyUrl = buildProxyUrl(proxy);
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';

    if (isHttps) {
      // Use CONNECT tunnel via proxy
      const connectOptions: http.RequestOptions = {
        host: proxy.host,
        port: proxy.port,
        method: 'CONNECT',
        path: `${parsed.hostname}:443`,
        timeout: timeoutMs,
      };
      if (proxy.username) {
        const auth = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64');
        connectOptions.headers = { 'Proxy-Authorization': `Basic ${auth}` };
      }

      const connectReq = http.request(connectOptions);
      connectReq.on('connect', (_res, socket) => {
        const tlsOptions = {
          socket,
          servername: parsed.hostname,
          rejectUnauthorized: false,
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const tls = require('tls') as typeof import('tls');
        const tlsSocket = tls.connect(tlsOptions, () => {
          const getReq = `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.hostname}\r\nConnection: close\r\n\r\n`;
          tlsSocket.write(getReq);
          let data = '';
          tlsSocket.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          tlsSocket.on('end', () => {
            const body = data.split('\r\n\r\n').slice(1).join('\r\n\r\n');
            resolve(body);
          });
          tlsSocket.on('error', reject);
        });
        tlsSocket.on('error', reject);
      });
      connectReq.on('error', reject);
      connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('Proxy connect timed out')); });
      connectReq.end();
    } else {
      // Plain HTTP proxy
      const options: http.RequestOptions = {
        host: proxy.host,
        port: proxy.port,
        path: targetUrl,
        timeout: timeoutMs,
        headers: { Host: parsed.hostname },
      };
      if (proxy.username) {
        const auth = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64');
        options.headers = { ...options.headers, 'Proxy-Authorization': `Basic ${auth}` };
      }
      const req = http.get(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    }
    void proxyUrl; // used for SOCKS via proxy-chain path
  });
}

function buildProxyUrl(proxy: ProxyConfig): string {
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
    : '';
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
}

// ─── ProxyManager ─────────────────────────────────────────────────────────────

export class ProxyManager {
  private proxies: Map<string, ProxyConfig> = new Map();
  private readonly proxiesPath: string;

  constructor(proxiesPath?: string) {
    this.proxiesPath = proxiesPath ?? PROXIES_PATH;
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.proxiesPath, 'utf-8');
      const stored = JSON.parse(raw) as StoredProxy[];
      for (const item of stored) {
        const proxy: ProxyConfig = {
          ...item,
          password: item.password ? decrypt(item.password) : undefined,
        };
        this.proxies.set(proxy.id, proxy);
      }
      logger.info('ProxyManager initialized', { count: this.proxies.size });
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        logger.warn('ProxyManager: failed to load proxies.json', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    const stored: StoredProxy[] = Array.from(this.proxies.values()).map((p) => ({
      ...p,
      password: p.password ? encrypt(p.password) : undefined,
    }));
    await fs.mkdir(path.dirname(this.proxiesPath), { recursive: true });
    await fs.writeFile(this.proxiesPath, JSON.stringify(stored, null, 2), 'utf-8');
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async createProxy(data: Omit<ProxyConfig, 'id'>): Promise<ProxyConfig> {
    const proxy: ProxyConfig = { id: uuidv4(), ...data };
    this.proxies.set(proxy.id, proxy);
    await this.persist();
    logger.info('Proxy created', { id: proxy.id, host: proxy.host });
    return proxy;
  }

  async updateProxy(id: string, data: Partial<Omit<ProxyConfig, 'id'>>): Promise<ProxyConfig> {
    const existing = this.proxies.get(id);
    if (!existing) throw new Error(`Proxy not found: ${id}`);
    const updated: ProxyConfig = { ...existing, ...data, id };
    this.proxies.set(id, updated);
    await this.persist();
    return updated;
  }

  async deleteProxy(id: string): Promise<void> {
    if (!this.proxies.has(id)) throw new Error(`Proxy not found: ${id}`);
    this.proxies.delete(id);
    await this.persist();
    logger.info('Proxy deleted', { id });
  }

  getProxy(id: string): ProxyConfig | undefined {
    return this.proxies.get(id);
  }

  listProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values());
  }

  // ─── Test proxy ────────────────────────────────────────────────────────────

  parseProxyInput(input: string, defaultType: ProxyConfig['type'] = 'http'): Array<Omit<ProxyConfig, 'id'>> {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

    return lines.map((line) => this.parseProxyLine(line, defaultType));
  }

  async importProxyList(
    input: string,
    defaultType: ProxyConfig['type'] = 'http',
  ): Promise<{ created: ProxyConfig[]; skipped: number }> {
    const parsed = this.parseProxyInput(input, defaultType);
    const created: ProxyConfig[] = [];
    let skipped = 0;

    for (const candidate of parsed) {
      if (this.hasMatchingProxy(candidate)) {
        skipped += 1;
        continue;
      }
      created.push(await this.createProxy(candidate));
    }

    return { created, skipped };
  }

  async testProxy(proxy: ProxyConfig): Promise<string> {
    const isSocks = proxy.type === 'socks4' || proxy.type === 'socks5';

    if (isSocks) {
      // Use proxy-chain anonymizeProxy to create a local HTTP forwarder for SOCKS
      const proxyUrl = buildProxyUrl(proxy);
      const localProxyUrl = await ProxyChain.anonymizeProxy(proxyUrl);
      try {
        const localParsed = new URL(localProxyUrl);
        const localPort = parseInt(localParsed.port, 10);
        const httpProxy: ProxyConfig = {
          id: proxy.id,
          type: 'http',
          host: '127.0.0.1',
          port: localPort,
        };
        const body = await httpGetViaProxy('https://api.ipify.org?format=json', httpProxy, 10000);
        const parsed = JSON.parse(body) as { ip: string };
        return parsed.ip;
      } finally {
        await ProxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => undefined);
      }
    } else {
      const body = await httpGetViaProxy('https://api.ipify.org?format=json', proxy, 10000);
      const parsed = JSON.parse(body) as { ip: string };
      return parsed.ip;
    }
  }

  // ─── Detect timezone from IP ───────────────────────────────────────────────

  async detectTimezoneFromProxy(ip: string): Promise<string> {
    const body = await httpGet(`https://ipapi.co/${ip}/timezone`, 5000);
    return body.trim();
  }

  // ─── Build proxy config for Chrome ────────────────────────────────────────

  async buildProxyConfig(proxy: ProxyConfig): Promise<ProxyBuildResult> {
    const { type, host, port, username, password } = proxy;

    if (type === 'http' || type === 'https') {
      return {
        flag: `--proxy-server=http://${host}:${port}`,
        cleanup: null,
      };
    }

    if (type === 'socks4') {
      return {
        flag: `--proxy-server=socks4://${host}:${port}`,
        cleanup: null,
      };
    }

    // SOCKS5 — if auth required, use proxy-chain local forwarder
    if (username) {
      const upstreamUrl = buildProxyUrl(proxy);
      const localProxyUrl = await ProxyChain.anonymizeProxy(upstreamUrl);
      const localParsed = new URL(localProxyUrl);
      const localPort = parseInt(localParsed.port, 10);

      const cleanup = (): void => {
        ProxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => undefined);
      };

      return {
        flag: `--proxy-server=socks5://127.0.0.1:${localPort}`,
        cleanup,
      };
    }

    // SOCKS5 without auth
    return {
      flag: `--proxy-server=socks5://${host}:${port}`,
      cleanup: null,
    };
  }

  private hasMatchingProxy(candidate: Omit<ProxyConfig, 'id'>): boolean {
    return this.listProxies().some((proxy) => (
      proxy.type === candidate.type
      && proxy.host === candidate.host
      && proxy.port === candidate.port
      && (proxy.username ?? '') === (candidate.username ?? '')
      && (proxy.password ?? '') === (candidate.password ?? '')
    ));
  }

  private parseProxyLine(line: string, defaultType: ProxyConfig['type']): Omit<ProxyConfig, 'id'> {
    if (line.includes('://')) {
      const parsed = new URL(line);
      const type = parsed.protocol.replace(':', '') as ProxyConfig['type'];
      if (!['http', 'https', 'socks4', 'socks5'].includes(type)) {
        throw new Error(`Unsupported proxy protocol: ${type}`);
      }

      const port = Number(parsed.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid proxy port in line: ${line}`);
      }

      return {
        type,
        host: parsed.hostname,
        port,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      };
    }

    const parts = line.split(':');
    if (parts.length === 2 || parts.length === 4) {
      const [host, rawPort, username, password] = parts;
      const port = Number(rawPort);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid proxy line: ${line}`);
      }

      return {
        type: defaultType,
        host,
        port,
        username,
        password,
      };
    }

    throw new Error(`Unsupported proxy format: ${line}`);
  }
}

export const proxyManager = new ProxyManager();
