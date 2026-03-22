import fs from 'fs/promises';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import { runtimeManager } from './RuntimeManager';
import { proxyManager } from './ProxyManager';
import { profileManager } from './ProfileManager';
import { fingerprintEngine } from './FingerprintEngine';
import { configManager } from './ConfigManager';
import { findFreePort } from '../utils/portScanner';
import { waitForCDP } from '../utils/cdpWaiter';
import { logger } from '../utils/logger';
import { wsServer } from '../utils/wsServer';
import { dataPath, resolveAppPath } from '../utils/dataPaths';

export interface Instance {
  profileId: string;
  profileName: string;
  runtime: string;
  pid: number;
  remoteDebuggingPort: number;
  userDataDir: string;
  launchMode: 'native' | 'headless';
  status: 'running' | 'stopped' | 'unreachable' | 'stale';
  startedAt: string;
  lastHealthCheckAt: string | null;
}

interface RunningEntry {
  instance: Instance;
  process: ChildProcess;
  proxyCleanup: (() => void) | null;
}

const INSTANCES_PATH = dataPath('instances.json');
const ACTIVITY_LOG_PATH = dataPath('activity.log');
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const SIGTERM_WAIT_MS = 3_000;

function buildChromeFlags(opts: {
  userDataDir: string;
  remoteDebuggingPort: number;
  extensionDir: string;
  proxyFlag: string | null;
  headless: boolean;
  webrtcPolicy: string;
}): string[] {
  const flags: string[] = [
    `--user-data-dir=${opts.userDataDir}`,
    `--remote-debugging-port=${opts.remoteDebuggingPort}`,
    `--load-extension=${opts.extensionDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-apps',
    '--mute-audio',
    `--webrtc-ip-handling-policy=${opts.webrtcPolicy}`,
  ];
  if (opts.proxyFlag) flags.push(opts.proxyFlag);
  if (opts.headless) {
    flags.push('--headless=new');
    flags.push('--disable-gpu');
  }
  return flags;
}

function pidExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function cdpPing(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/version', timeout: 2000 },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}


export class InstanceManager {
  private running: Map<string, RunningEntry> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly instancesPath: string;
  private readonly dataDir: string;

  constructor(instancesPath?: string, dataDir?: string) {
    this.instancesPath = instancesPath ?? INSTANCES_PATH;
    this.dataDir = dataDir ?? dataPath();
  }

  async initialize(): Promise<void> {
    await this.reconcileOnRestart();
    this.startHealthCheckLoop();
    logger.info('InstanceManager initialized');
  }

  private async reconcileOnRestart(): Promise<void> {
    try {
      const raw = await fs.readFile(this.instancesPath, 'utf-8');
      const saved = JSON.parse(raw) as Instance[];
      const reconciled: Instance[] = saved.map((inst) => {
        if (inst.status === 'running' && !pidExists(inst.pid)) {
          return { ...inst, status: 'stale' };
        }
        return inst;
      });
      await this.persistInstances(reconciled);
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        logger.warn('InstanceManager: failed to load instances.json', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async launchInstance(profileId: string): Promise<Instance> {
    if (this.running.has(profileId)) {
      throw new Error(`Instance already running for profile: ${profileId}`);
    }
    const profile = profileManager.getProfile(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);

    const executablePath = await runtimeManager.resolveRuntime(profile.runtime);

    let proxyFlag: string | null = null;
    let proxyCleanup: (() => void) | null = null;
    if (profile.proxy) {
      const result = await proxyManager.buildProxyConfig(profile.proxy);
      proxyFlag = result.flag;
      proxyCleanup = result.cleanup;
    }

    const extensionDir = await fingerprintEngine.prepareExtension(
      profileId, profile.fingerprint, this.dataDir,
    );

    const remoteDebuggingPort = await findFreePort();
    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const userDataDir = path.join(profilesDir, profileId);
    const headless = configManager.get().headless;
    const webrtcPolicy = profile.fingerprint.webrtcPolicy ?? 'disable_non_proxied_udp';

    const flags = buildChromeFlags({
      userDataDir, remoteDebuggingPort, extensionDir, proxyFlag, headless, webrtcPolicy,
    });

    logger.info('Launching instance', { profileId, executablePath, port: remoteDebuggingPort });
    const child = spawn(executablePath, flags, { detached: false, stdio: 'ignore' });
    const pid = child.pid;

    if (!pid) {
      if (proxyCleanup) proxyCleanup();
      throw new Error('Failed to spawn browser process (no PID)');
    }

    try {
      await waitForCDP(remoteDebuggingPort, 30_000);
    } catch (err) {
      child.kill('SIGKILL');
      if (proxyCleanup) proxyCleanup();
      throw new Error(`Browser did not become ready: ${err instanceof Error ? err.message : String(err)}`);
    }

    const instance: Instance = {
      profileId,
      profileName: profile.name,
      runtime: executablePath,
      pid,
      remoteDebuggingPort,
      userDataDir,
      launchMode: headless ? 'headless' : 'native',
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHealthCheckAt: null,
    };

    this.running.set(profileId, { instance, process: child, proxyCleanup });

    child.on('exit', () => {
      const entry = this.running.get(profileId);
      if (entry) {
        const stoppedAt = new Date().toISOString();
        entry.instance.status = 'stopped';
        this.running.delete(profileId);
        this.persistCurrentInstances().catch(() => undefined);
        this.appendActivityLog(profileId, entry.instance.startedAt, stoppedAt).catch(() => undefined);
        wsServer.broadcast({ type: 'instance:stopped', payload: { profileId, status: 'stopped' } });
        logger.info('Instance exited', { profileId });
      }
    });

    await this.persistCurrentInstances();
    await profileManager.updateLastUsed(profileId);
    wsServer.broadcast({ type: 'instance:started', payload: { profileId, status: 'running', port: remoteDebuggingPort } });
    logger.info('Instance launched', { profileId, pid, port: remoteDebuggingPort });
    return instance;
  }

  async stopInstance(profileId: string): Promise<void> {
    const entry = this.running.get(profileId);
    if (!entry) throw new Error(`No running instance for profile: ${profileId}`);

    const { process: child, proxyCleanup } = entry;
    child.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
        resolve();
      }, SIGTERM_WAIT_MS);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });

    if (proxyCleanup) proxyCleanup();
    entry.instance.status = 'stopped';
    const stoppedAt = new Date().toISOString();
    this.running.delete(profileId);
    await this.persistCurrentInstances();
    await this.appendActivityLog(profileId, entry.instance.startedAt, stoppedAt);
    wsServer.broadcast({ type: 'instance:stopped', payload: { profileId, status: 'stopped' } });
    logger.info('Instance stopped', { profileId });
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.running.keys());
    await Promise.all(ids.map((id) => this.stopInstance(id).catch(() => undefined)));
  }

  private startHealthCheckLoop(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks().catch(() => undefined);
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async runHealthChecks(): Promise<void> {
    let changed = false;
    for (const [profileId, entry] of this.running.entries()) {
      const alive = await cdpPing(entry.instance.remoteDebuggingPort);
      entry.instance.lastHealthCheckAt = new Date().toISOString();
      if (!alive && entry.instance.status === 'running') {
        entry.instance.status = 'unreachable';
        changed = true;
        wsServer.broadcast({ type: 'instance:status-changed', payload: { profileId, status: 'unreachable', port: entry.instance.remoteDebuggingPort } });
        logger.warn('Instance unreachable', { profileId });
      } else if (alive && entry.instance.status === 'unreachable') {
        entry.instance.status = 'running';
        changed = true;
        wsServer.broadcast({ type: 'instance:status-changed', payload: { profileId, status: 'running', port: entry.instance.remoteDebuggingPort } });
      }
    }
    if (changed) await this.persistCurrentInstances();
  }

  async sessionCheck(
    profileId: string,
    url: string,
  ): Promise<{ result: 'logged_in' | 'logged_out' | 'error'; reason?: string }> {
    const profile = profileManager.getProfile(profileId);
    if (!profile) return { result: 'error', reason: 'profile_not_found' };

    let executablePath: string;
    try {
      executablePath = await runtimeManager.resolveRuntime(profile.runtime);
    } catch {
      return { result: 'error', reason: 'no_runtime' };
    }

    let proxyFlag: string | null = null;
    let proxyCleanup: (() => void) | null = null;
    if (profile.proxy) {
      try {
        const result = await proxyManager.buildProxyConfig(profile.proxy);
        proxyFlag = result.flag;
        proxyCleanup = result.cleanup;
      } catch { /* proceed without proxy */ }
    }

    const extensionDir = await fingerprintEngine.prepareExtension(
      profileId, profile.fingerprint, this.dataDir,
    );

    const remoteDebuggingPort = await findFreePort();
    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const userDataDir = path.join(profilesDir, profileId);
    const timeoutMs = configManager.get().sessionCheck.timeoutMs;

    const flags = buildChromeFlags({
      userDataDir,
      remoteDebuggingPort,
      extensionDir,
      proxyFlag,
      headless: true,
      webrtcPolicy: profile.fingerprint.webrtcPolicy ?? 'disable_non_proxied_udp',
    });

    const child = spawn(executablePath, flags, { detached: false, stdio: 'ignore' });
    const pid = child.pid;

    if (!pid) {
      if (proxyCleanup) proxyCleanup();
      return { result: 'error', reason: 'spawn_failed' };
    }

    try {
      await waitForCDP(remoteDebuggingPort, timeoutMs);
      const finalUrl = await this.cdpGetCurrentUrl(remoteDebuggingPort, timeoutMs);
      const parsedTarget = new URL(url);
      const parsedFinal = new URL(finalUrl);
      const isLoggedOut =
        parsedFinal.hostname !== parsedTarget.hostname ||
        parsedFinal.pathname.toLowerCase().includes('login') ||
        parsedFinal.pathname.toLowerCase().includes('signin') ||
        parsedFinal.pathname.toLowerCase().includes('auth');
      return { result: isLoggedOut ? 'logged_out' : 'logged_in' };
    } catch (err) {
      return { result: 'error', reason: err instanceof Error ? err.message : String(err) };
    } finally {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 2000);
      if (proxyCleanup) proxyCleanup();
    }
  }

  private cdpGetCurrentUrl(port: number, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Session check timed out')), timeoutMs);
      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/list', timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            clearTimeout(deadline);
            try {
              const targets = JSON.parse(data) as Array<{ url: string; type: string }>;
              const page = targets.find((t) => t.type === 'page');
              resolve(page?.url ?? '');
            } catch { resolve(''); }
          });
        },
      );
      req.on('error', () => { clearTimeout(deadline); resolve(''); });
    });
  }

  listInstances(): Instance[] {
    return Array.from(this.running.values()).map((e) => e.instance);
  }

  getInstance(profileId: string): Instance | undefined {
    return this.running.get(profileId)?.instance;
  }

  getStatus(profileId: string): Instance['status'] | 'not_running' {
    return this.running.get(profileId)?.instance.status ?? 'not_running';
  }

  private async appendActivityLog(profileId: string, startedAt: string, stoppedAt: string): Promise<void> {
    const durationMs = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
    const entry = JSON.stringify({ profileId, startedAt, stoppedAt, durationMs }) + '\n';
    try {
      await fs.mkdir(path.dirname(ACTIVITY_LOG_PATH), { recursive: true });
      await fs.appendFile(ACTIVITY_LOG_PATH, entry, 'utf-8');
    } catch (err) {
      logger.warn('Failed to write activity log', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async persistCurrentInstances(): Promise<void> {
    await this.persistInstances(Array.from(this.running.values()).map((e) => e.instance));
  }

  private async persistInstances(instances: Instance[]): Promise<void> {
    await fs.mkdir(path.dirname(this.instancesPath), { recursive: true });
    await fs.writeFile(this.instancesPath, JSON.stringify(instances, null, 2), 'utf-8');
  }
}

export const instanceManager = new InstanceManager();
