import path from 'path';
import { runtimeManager } from '../runtimes/RuntimeManager';
import { proxyManager } from '../../managers/ProxyManager';
import { fingerprintEngine } from '../../managers/FingerprintEngine';
import { extensionManager } from '../../managers/ExtensionManager';
import { configManager } from '../config/ConfigManager';
import { findFreePort } from '../../core/network/portScanner';
import { resolveAppPath } from '../../core/fs/dataPaths';
import { buildChromeFlags } from './chromeFlags';
import type { Profile } from '../../../shared/contracts';

export async function buildLaunchContext(profile: Profile, dataDir: string, headlessOverride?: boolean): Promise<{
  executablePath: string;
  proxyCleanup: (() => void) | null;
  remoteDebuggingPort: number;
  userDataDir: string;
  flags: string[];
  headless: boolean;
}> {
  const executablePath = await runtimeManager.resolveRuntime(profile.runtime);

  let proxyFlag: string | null = null;
  let proxyCleanup: (() => void) | null = null;
  if (profile.proxy) {
    const result = await proxyManager.buildProxyConfig(profile.proxy);
    proxyFlag = result.flag;
    proxyCleanup = result.cleanup;
  }

  const extensionDir = await fingerprintEngine.prepareExtension(profile.id, profile.fingerprint, dataDir, {
    profileId: profile.id,
    profileName: profile.name,
    profileGroup: profile.group,
    profileOwner: profile.owner,
  });
  const managedExtensionDirs = await extensionManager.resolveEnabledExtensionPaths(profile.extensionIds);
  const remoteDebuggingPort = await findFreePort();
  const userDataDir = path.join(resolveAppPath(configManager.get().profilesDir), profile.id);
  const headless = headlessOverride ?? configManager.get().headless;

  const flags = buildChromeFlags({
    userDataDir,
    remoteDebuggingPort,
    extensionDirs: [extensionDir, ...managedExtensionDirs],
    proxyFlag,
    headless,
    webrtcPolicy: profile.fingerprint.webrtcPolicy ?? 'disable_non_proxied_udp',
  });

  return {
    executablePath,
    proxyCleanup,
    remoteDebuggingPort,
    userDataDir,
    flags,
    headless,
  };
}
