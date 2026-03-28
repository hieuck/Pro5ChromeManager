import path from 'path';
import { runtimeManager } from '../runtimes/RuntimeManager';
import { proxyManager } from '../proxies/ProxyManager';
import { fingerprintEngine } from '../profiles/FingerprintEngine';
import { extensionManager } from '../extensions/ExtensionManager';
import { configManager } from '../config/ConfigManager';
import { findFreePort } from '../../core/network/portScanner';
import { resolveAppPath } from '../../core/fs/dataPaths';
import { buildChromeFlags } from './chromeFlags';
import type { Profile } from '../../../shared/contracts';

const DEFAULT_WEBRTC_POLICY = 'disable_non_proxied_udp';

export interface LaunchContext {
  executablePath: string;
  proxyCleanup: (() => void) | null;
  remoteDebuggingPort: number;
  userDataDir: string;
  flags: string[];
  headless: boolean;
}

export async function buildLaunchContext(
  profile: Profile,
  dataDir: string,
  headlessOverride?: boolean,
): Promise<LaunchContext> {
  const config = configManager.get();
  const executablePath = await runtimeManager.resolveRuntime(profile.runtime);

  let proxyFlag: string | null = null;
  let proxyCleanup: (() => void) | null = null;
  if (profile.proxy) {
    const proxyResult = await proxyManager.buildProxyConfig(profile.proxy);
    proxyFlag = proxyResult.flag;
    proxyCleanup = proxyResult.cleanup;
  }

  const extensionDir = await fingerprintEngine.prepareExtension(profile.id, profile.fingerprint, dataDir, {
    profileId: profile.id,
    profileName: profile.name,
    profileGroup: profile.group,
    profileOwner: profile.owner,
  });
  const managedExtensionDirs = await extensionManager.resolveEnabledExtensionPaths(profile.extensionIds);
  const remoteDebuggingPort = await findFreePort();
  const userDataDir = path.join(resolveAppPath(config.profilesDir), profile.id);
  const headless = headlessOverride ?? config.headless;

  const flags = buildChromeFlags({
    userDataDir,
    remoteDebuggingPort,
    extensionDirs: [extensionDir, ...managedExtensionDirs],
    proxyFlag,
    headless,
    webrtcPolicy: profile.fingerprint.webrtcPolicy ?? DEFAULT_WEBRTC_POLICY,
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
