import { dataPath } from '../core/fs/dataPaths';
import { waitForCDP } from '../core/browser/cdpWaiter';
import { logger } from '../core/logging/logger';
import { wsServer } from '../core/realtime/wsServer';
import { profileManager } from './ProfileManager';
import { cookieManager } from './CookieManager';
import { configManager } from './ConfigManager';
import { usageMetricsManager } from './UsageMetricsManager';
import type { Instance } from '../../shared/contracts';
import { activityLogger } from '../features/instances/activityLogger';
import { cdpClient } from '../features/instances/cdpClient';
import { processManager } from '../features/instances/processManager';
import { buildLaunchContext } from '../features/instances/launchContext';
import { persistRunningEntries, reconcilePersistedInstances } from '../features/instances/persistence';
import { runSessionCheck } from '../features/instances/sessionCheck';
import type { RunningEntry } from '../features/instances/types';

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
    await reconcilePersistedInstances(this.instancesPath);
    this.startHealthCheckLoop();
    logger.info('InstanceManager initialized');
  }

  async launchInstance(profileId: string): Promise<Instance> {
    if (this.running.has(profileId)) {
      throw new Error(`Instance already running for profile: ${profileId}`);
    }

    const profile = profileManager.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const launchContext = await buildLaunchContext(profile, this.dataDir);
    logger.info('Launching instance', {
      profileId,
      executablePath: launchContext.executablePath,
      port: launchContext.remoteDebuggingPort,
    });

    const child = processManager.spawn(launchContext.executablePath, launchContext.flags);
    const pid = child.pid;

    if (!pid) {
      if (launchContext.proxyCleanup) {
        launchContext.proxyCleanup();
      }
      throw new Error('Failed to spawn browser process (no PID)');
    }

    try {
      await waitForCDP(launchContext.remoteDebuggingPort, 30_000);
    } catch (error) {
      processManager.kill(child, 'SIGKILL');
      if (launchContext.proxyCleanup) {
        launchContext.proxyCleanup();
      }
      throw new Error(`Browser did not become ready: ${error instanceof Error ? error.message : String(error)}`);
    }

    await this.applySavedCookies(profileId, launchContext.remoteDebuggingPort);

    const instance: Instance = {
      profileId,
      profileName: profile.name,
      runtime: launchContext.executablePath,
      pid,
      remoteDebuggingPort: launchContext.remoteDebuggingPort,
      userDataDir: launchContext.userDataDir,
      launchMode: launchContext.headless ? 'headless' : 'native',
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHealthCheckAt: null,
    };

    this.running.set(profileId, {
      instance,
      process: child,
      proxyCleanup: launchContext.proxyCleanup,
    });

    child.on('exit', () => {
      const entry = this.running.get(profileId);
      if (!entry) {
        return;
      }

      const stoppedAt = new Date().toISOString();
      entry.instance.status = 'stopped';
      this.running.delete(profileId);
      void persistRunningEntries(this.instancesPath, this.running);
      void activityLogger.append(profileId, entry.instance.startedAt, stoppedAt);
      wsServer.broadcast({ type: 'instance:stopped', payload: { profileId, status: 'stopped' } });
      logger.info('Instance exited', { profileId });
    });

    await persistRunningEntries(this.instancesPath, this.running);
    await profileManager.updateLastUsed(profileId);
    await usageMetricsManager.recordProfileLaunch();
    wsServer.broadcast({
      type: 'instance:started',
      payload: { profileId, status: 'running', port: launchContext.remoteDebuggingPort },
    });
    logger.info('Instance launched', { profileId, pid, port: launchContext.remoteDebuggingPort });
    return instance;
  }

  async stopInstance(profileId: string): Promise<void> {
    const entry = this.running.get(profileId);
    if (!entry) {
      throw new Error(`No running instance for profile: ${profileId}`);
    }

    processManager.kill(entry.process, 'SIGTERM');
    await processManager.waitForExit(entry.process, SIGTERM_WAIT_MS);

    if (entry.proxyCleanup) {
      entry.proxyCleanup();
    }

    entry.instance.status = 'stopped';
    const stoppedAt = new Date().toISOString();
    this.running.delete(profileId);
    await persistRunningEntries(this.instancesPath, this.running);
    await activityLogger.append(profileId, entry.instance.startedAt, stoppedAt);
    wsServer.broadcast({ type: 'instance:stopped', payload: { profileId, status: 'stopped' } });
    logger.info('Instance stopped', { profileId });
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.running.keys());
    await Promise.all(ids.map((id) => this.stopInstance(id).catch(() => undefined)));
  }

  stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  async sessionCheck(profileId: string, url: string): Promise<{ result: 'logged_in' | 'logged_out' | 'error'; reason?: string }> {
    const profile = profileManager.getProfile(profileId);
    if (!profile) {
      return { result: 'error', reason: 'profile_not_found' };
    }

    let launchContext;
    try {
      launchContext = await buildLaunchContext(profile, this.dataDir, true);
    } catch {
      return { result: 'error', reason: 'no_runtime' };
    }

    const child = processManager.spawn(launchContext.executablePath, launchContext.flags);
    return runSessionCheck({
      child,
      port: launchContext.remoteDebuggingPort,
      timeoutMs: configManager.get().sessionCheck.timeoutMs,
      targetUrl: url,
      proxyCleanup: launchContext.proxyCleanup,
    });
  }

  listInstances(): Instance[] {
    return Array.from(this.running.values()).map((entry) => entry.instance);
  }

  getInstance(profileId: string): Instance | undefined {
    return this.running.get(profileId)?.instance;
  }

  getStatus(profileId: string): Instance['status'] | 'not_running' {
    return this.running.get(profileId)?.instance.status ?? 'not_running';
  }

  private startHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthChecks();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private async runHealthChecks(): Promise<void> {
    let changed = false;
    for (const [profileId, entry] of this.running.entries()) {
      const alive = await cdpClient.ping(entry.instance.remoteDebuggingPort);
      entry.instance.lastHealthCheckAt = new Date().toISOString();
      if (!alive && entry.instance.status === 'running') {
        entry.instance.status = 'unreachable';
        changed = true;
        wsServer.broadcast({
          type: 'instance:status-changed',
          payload: { profileId, status: 'unreachable', port: entry.instance.remoteDebuggingPort },
        });
        logger.warn('Instance unreachable', { profileId });
      } else if (alive && entry.instance.status === 'unreachable') {
        entry.instance.status = 'running';
        changed = true;
        wsServer.broadcast({
          type: 'instance:status-changed',
          payload: { profileId, status: 'running', port: entry.instance.remoteDebuggingPort },
        });
      }
    }

    if (changed) {
      await persistRunningEntries(this.instancesPath, this.running);
    }
  }

  private async applySavedCookies(profileId: string, port: number): Promise<void> {
    const cookies = await cookieManager.listCookies(profileId);
    if (cookies.length === 0) {
      return;
    }

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
    } catch (error) {
      logger.warn('Failed to apply saved cookies to launched instance', {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const instanceManager = new InstanceManager();
