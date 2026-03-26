import { v4 as uuidv4 } from 'uuid';
import * as ProxyChain from 'proxy-chain';
import { logger } from '../../core/logging/logger';
import { ProxyConfig } from '../../../shared/contracts';
import { dataPath } from '../../core/fs/dataPaths';

// Specialized Services
import { proxyParser } from './proxyParser';
import { proxyTester } from './proxyTester';
import { loadStoredProxies, persistStoredProxies } from './storage';

export interface ProxyBuildResult {
  flag: string;
  cleanup: (() => void) | null;
}

export interface ProxyHealthSnapshot {
  lastCheckAt: string;
  lastCheckStatus: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

const PROXIES_PATH = dataPath('proxies.json');

export class ProxyManager {
  private proxies: Map<string, ProxyConfig> = new Map();
  private readonly proxiesPath: string;

  constructor(proxiesPath?: string) {
    this.proxiesPath = proxiesPath ?? PROXIES_PATH;
  }

  async initialize(): Promise<void> {
    const proxies = await loadStoredProxies(this.proxiesPath);
    this.proxies = new Map(proxies.map((proxy) => [proxy.id, proxy]));
    logger.info('ProxyManager initialized', { count: this.proxies.size });
  }

  private async persist(): Promise<void> {
    await persistStoredProxies(this.proxiesPath, Array.from(this.proxies.values()));
  }

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
    if (!this.proxies.delete(id)) throw new Error(`Proxy not found: ${id}`);
    await this.persist();
    logger.info('Proxy deleted', { id });
  }

  getProxy(id: string): ProxyConfig | undefined {
    return this.proxies.get(id);
  }

  listProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values());
  }

  parseProxyInput(input: string, defaultType: ProxyConfig['type'] = 'http'): Array<Omit<ProxyConfig, 'id'>> {
    return proxyParser.parseInput(input, defaultType);
  }

  parseProxyLine(line: string, defaultType: ProxyConfig['type']): Omit<ProxyConfig, 'id'> {
    return proxyParser.parseLine(line, defaultType);
  }

  async importProxyList(input: string, defaultType: ProxyConfig['type'] = 'http'): Promise<{ created: ProxyConfig[]; skipped: number }> {
    const parsed = proxyParser.parseInput(input, defaultType);
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
    return proxyTester.testProxy(proxy);
  }

  async detectTimezoneFromProxy(ip: string): Promise<string> {
    return proxyTester.detectTimezone(ip);
  }

  async recordTestSnapshot(id: string, snapshot: ProxyHealthSnapshot): Promise<ProxyConfig> {
    const existing = this.proxies.get(id);
    if (!existing) throw new Error(`Proxy not found: ${id}`);

    const updated: ProxyConfig = {
      ...existing,
      ...snapshot,
      lastCheckIp: snapshot.lastCheckIp ?? undefined,
      lastCheckTimezone: snapshot.lastCheckTimezone ?? null,
      lastCheckError: snapshot.lastCheckError ?? undefined,
    };
    this.proxies.set(id, updated);
    await this.persist();
    return updated;
  }

  async buildProxyConfig(proxy: ProxyConfig): Promise<ProxyBuildResult> {
    const { type, host, port, username, password } = proxy;

    if (type === 'http' || type === 'https') {
      return { flag: `--proxy-server=http://${host}:${port}`, cleanup: null };
    }
    if (type === 'socks4') {
      return { flag: `--proxy-server=socks4://${host}:${port}`, cleanup: null };
    }

    if (username) {
      const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}@`;
      const upstreamUrl = `${type}://${auth}${host}:${port}`;
      const localProxyUrl = await ProxyChain.anonymizeProxy(upstreamUrl);
      const localParsed = new URL(localProxyUrl);
      
      const cleanup = (): void => {
        ProxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => undefined);
      };

      return {
        flag: `--proxy-server=socks5://127.0.0.1:${localParsed.port}`,
        cleanup,
      };
    }

    return { flag: `--proxy-server=socks5://${host}:${port}`, cleanup: null };
  }

  private hasMatchingProxy(candidate: Omit<ProxyConfig, 'id'>): boolean {
    return Array.from(this.proxies.values()).some((p) => (
      p.type === candidate.type && p.host === candidate.host && p.port === candidate.port &&
      (p.username ?? '') === (candidate.username ?? '') && (p.password ?? '') === (candidate.password ?? '')
    ));
  }
}

export const proxyManager = new ProxyManager();
