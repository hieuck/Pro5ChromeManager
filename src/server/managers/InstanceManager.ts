import fs from 'fs/promises';
import path from 'path';
import { ChildProcess } from 'child_process';
import { runtimeManager } from './RuntimeManager';
import { proxyManager } from './ProxyManager';
import { profileManager } from './ProfileManager';
import { fingerprintEngine } from './FingerprintEngine';
import { extensionManager } from './ExtensionManager';
import { cookieManager } from './CookieManager';
import { configManager } from './ConfigManager';
import { usageMetricsManager } from './UsageMetricsManager';
import { findFreePort } from '../utils/portScanner';
import { waitForCDP } from '../utils/cdpWaiter';
import { logger } from '../utils/logger';
import { wsServer } from '../utils/wsServer';
import { resolveAppPath, dataPath } from '../utils/dataPaths';
import { Instance } from '../shared/types';

// Specialized Services
import { buildChromeFlags } from './instance/ChromeFlags';
import { cdpClient } from './instance/CDPClient';
import { processManager } from './instance/ProcessManager';
import { activityLogger } from './instance/ActivityLogger';

interface RunningEntry {
  instance: Instance;
  process: ChildProcess;
  proxyCleanup: (() => void) | null;
}

const INSTANCES_PATH = dataPath('instances.json');
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const SIGTERM_WAIT_MS = 3_000;

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
        if (inst.status === 'running' && !processManager.exists(inst.pid)) {
          return { ...inst, status: 'stale' };
        }
        return inst;
      });
      await this.persistInstances(reconciled);
    } catch (err) {
      const isNotFound = err instanceof Error && 'code' in err && (err as any).code === 'ENOENT';
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
      profileId,
      profile.fingerprint,
      this.dataDir,
      {
        profileId,
        profileName: profile.name,
        profileGroup: profile.group,
        profileOwner: profile.owner,
      },
    );
    const managedExtensionDirs = await extensionManager.resolveEnabledExtensionPaths(profile.extensionIds);

    const remoteDebuggingPort = await findFreePort();
    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const userDataDir = path.join(profilesDir, profileId);
    const headless = configManager.get().headless;

    const flags = buildChromeFlags({
      userDataDir,
      remoteDebuggingPort,
      extensionDirs: [extensionDir, ...managedExtensionDirs],
      proxyFlag,
      headless,
      webrtcPolicy: profile.fingerprint.webrtcPolicy ?? 'disable_non_proxied_udp',
    });

    logger.info('Launching instance', { profileId, executablePath, port: remoteDebuggingPort });
    const child = processManager.spawn(executablePath, flags);
    const pid = child.pid;

    if (!pid) {
      if (proxyCleanup) proxyCleanup();
      throw new Error('Failed to spawn browser process (no PID)');
    }

    try {
      await waitForCDP(remoteDebuggingPort, 30_000);
    } catch (err) {
      processManager.kill(child, 'SIGKILL');
      if (proxyCleanup) proxyCleanup();
      throw new Error(`Browser did not become ready: ${err instanceof Error ? err.message : String(err)}`);
    }

    await this.applySavedCookies(profileId, remoteDebuggingPort);

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
        activityLogger.append(profileId, entry.instance.startedAt, stoppedAt).catch(() => undefined);
        wsServer.broadcast({ type: 'instance:stopped', payload: { profileId, status: 'stopped' } });
        logger.info('Instance exited', { profileId });
      }
    });

    await this.persistCurrentInstances();
    await profileManager.updateLastUsed(profileId);
    await usageMetricsManager.recordProfileLaunch();
    wsServer.broadcast({ type: 'instance:started', payload: { profileId, status: 'running', port: remoteDebuggingPort } });
    logger.info('Instance launched', { profileId, pid, port: remoteDebuggingPort });
    return instance;
  }

  async stopInstance(profileId: string): Promise<void> {
    const entry = this.running.get(profileId);
    if (!entry) throw new Error(`No running instance for profile: ${profileId}`);

    const { process: child, proxyCleanup } = entry;
    processManager.kill(child, 'SIGTERM');

    await processManager.waitForExit(child, SIGTERM_WAIT_MS);

    if (proxyCleanup) proxyCleanup();
    entry.instance.status = 'stopped';
    const stoppedAt = new Date().toISOString();
    this.running.delete(profileId);
    await this.persistCurrentInstances();
    await activityLogger.append(profileId, entry.instance.startedAt, stoppedAt);
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
      const alive = await cdpClient.ping(entry.instance.remoteDebuggingPort);
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

  private async applySavedCookies(profileId: string, port: number): Promise<void> {
    const cookies = await cookieManager.listCookies(profileId);
    if (cookies.length === 0) return;

    try {
      const webSocketDebuggerUrl = await cdpClient.getPageWebSocketUrl(port);
      if (!webSocketDebuggerUrl) {
        logger.warn('Skipping cookie apply because no page target is available', { profileId, port });
        return;
      }

      await cdpClient.sendCommandSequence(webSocketDebuggerUrl, [
        { method: 'Network.enable' },
        {
          method: 'Network.setCookies',
          params: {
            cookies: cookies.map((cookie) => cdpClient.toCDPCookie(cookie)),
          },
        },
      ]);

      logger.info('Applied saved cookies to launched instance', { profileId, count: cookies.length });
    } catch (err) {
      logger.warn('Failed to apply saved cookies to launched instance', {
        profileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sessionCheck(profileId: string, url: string): Promise<{ result: 'logged_in' | 'logged_out' | 'error'; reason?: string }> {
    const profile = profileManager.getProfile(profileId);
    if (!profile) return { result: 'error', reason: 'profile_not_found' };

    let executablePath: string;
    try { executablePath = await runtimeManager.resolveRuntime(profile.runtime); }
    catch { return { result: 'error', reason: 'no_runtime' }; }

    let proxyFlag: string|null = null;
    let proxyCleanup: (() => void)|null = null;
    if (profile.proxy) {
      try {
        const result = await proxyManager.buildProxyConfig(profile.proxy);
        proxyFlag = result.flag; proxyCleanup = result.cleanup;
      } catch { /* proceed without proxy */ }
    }

    const extDir = await fingerprintEngine.prepareExtension(profileId, profile.fingerprint, this.dataDir, {
      profileId, profileName: profile.name, profileGroup: profile.group, profileOwner: profile.owner
    });
    const managedExtDirs = await extensionManager.resolveEnabledExtensionPaths(profile.extensionIds);
    const port = await findFreePort();
    const profilesDir = resolveAppPath(configManager.get().profilesDir);
    const userDataDir = path.join(profilesDir, profileId);
    const timeoutMs = configManager.get().sessionCheck.timeoutMs;

    const flags = buildChromeFlags({
      userDataDir, remoteDebuggingPort: port, extensionDirs: [extDir, ...managedExtDirs],
      proxyFlag, headless: true, webrtcPolicy: profile.fingerprint.webrtcPolicy ?? 'disable_non_proxied_udp'
    });

    const child = processManager.spawn(executablePath, flags);
    if (!child.pid) {
      if (proxyCleanup) proxyCleanup();
      return { result: 'error', reason: 'spawn_failed' };
    }

    try {
      await waitForCDP(port, timeoutMs);
      const finalUrl = await cdpClient.getCurrentUrl(port, timeoutMs);
      const parsedTarget = new URL(url);
      const parsedFinal = new URL(finalUrl);
      const isLoggedOut = parsedFinal.hostname !== parsedTarget.hostname ||
        parsedFinal.pathname.toLowerCase().includes('login') ||
        parsedFinal.pathname.toLowerCase().includes('signin') ||
        parsedFinal.pathname.toLowerCase().includes('auth');
      const result = isLoggedOut ? 'logged_out' : 'logged_in';
      await usageMetricsManager.recordSessionCheck(result);
      return { result };
    } catch (err) {
      await usageMetricsManager.recordSessionCheck('error');
      return { result: 'error', reason: err instanceof Error ? err.message : String(err) };
    } finally {
      processManager.kill(child, 'SIGTERM');
      setTimeout(() => processManager.kill(child, 'SIGKILL'), 2000);
      if (proxyCleanup) proxyCleanup();
    }
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

  private async persistCurrentInstances(): Promise<void> {
    await this.persistInstances(Array.from(this.running.values()).map((e) => e.instance));
  }

  private async persistInstances(instances: Instance[]): Promise<void> {
    await fs.mkdir(path.dirname(this.instancesPath), { recursive: true });
    await fs.writeFile(this.instancesPath, JSON.stringify(instances, null, 2), 'utf-8');
  }
}

export const instanceManager = new InstanceManager();
