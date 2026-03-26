import { dataPath } from '../../core/fs/dataPaths';
import type {
  IncidentCategory,
  IncidentCategorySummary,
  IncidentSnapshot,
  SelfTestCheck,
} from '../../../shared/contracts';
import { buildIncidentSnapshot, fileExists, getSupportPagesReady, listLogFiles, loadIncidentEntries } from './supportDiagnostics';

export interface SupportStatusPayload {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  dataDir: string;
  logFileCount: number;
  diagnosticsReady: boolean;
  codeSigningConfigured: boolean;
  supportPagesReady: boolean;
  onboardingCompleted: boolean;
  onboardingState: {
    status: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
    currentStep: number;
    selectedRuntime: string | null;
    draftProfileName: string | null;
    createdProfileId: string | null;
    lastOpenedAt: string | null;
    lastUpdatedAt: string | null;
    profileCreatedAt: string | null;
    completedAt: string | null;
    skippedAt: string | null;
  };
  profileCount: number;
  proxyCount: number;
  backupCount: number;
  feedbackCount: number;
  lastFeedbackAt: string | null;
  usageMetrics: {
    profileCreates: number;
    profileImports: number;
    profileLaunches: number;
    sessionChecks: number;
    sessionCheckLoggedIn: number;
    sessionCheckLoggedOut: number;
    sessionCheckErrors: number;
    lastProfileCreatedAt: string | null;
    lastProfileImportedAt: string | null;
    lastProfileLaunchAt: string | null;
    lastSessionCheckAt: string | null;
  };
  recentIncidentCount: number;
  recentErrorCount: number;
  lastIncidentAt: string | null;
  recentIncidentTopCategory: IncidentCategory | null;
  recentIncidentCategories: IncidentCategorySummary[];
  releaseReady: boolean;
  warnings: string[];
  offlineSecretConfigured: boolean;
}

export interface SupportSelfTestPayload {
  status: 'pass' | 'warn' | 'fail';
  checkedAt: string;
  checks: SelfTestCheck[];
}

interface SupportStatusDeps {
  getConfig: () => { onboardingCompleted: boolean; profilesDir: string };
  listProfiles: () => unknown[];
  listProxies: () => unknown[];
  listBackups: () => Promise<unknown[]>;
  initializeUsageMetrics: () => Promise<void>;
  getUsageMetricsSnapshot: () => SupportStatusPayload['usageMetrics'];
  initializeOnboardingState: () => Promise<void>;
  getOnboardingSnapshot: () => SupportStatusPayload['onboardingState'];
  listFeedback: (limit: number) => Promise<Array<{ createdAt: string }>>;
}

interface SupportSelfTestDeps {
  getConfig: () => { profilesDir: string };
  refreshRuntimeAvailability: () => Promise<void>;
  listRuntimes: () => Array<{ available: boolean }>;
  listProxies: () => unknown[];
}

export function isProductionLikeRuntime(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

export async function createSupportStatus(deps: SupportStatusDeps): Promise<SupportStatusPayload> {
  const config = deps.getConfig();
  const profiles = deps.listProfiles();
  const proxies = deps.listProxies();
  const backups = await deps.listBackups();
  await deps.initializeUsageMetrics();
  await deps.initializeOnboardingState();
  const usageMetrics = deps.getUsageMetricsSnapshot();
  const onboardingState = deps.getOnboardingSnapshot();
  const feedbackEntries = await deps.listFeedback(50);
  const logFiles = await listLogFiles();
  const recentIncidents = buildIncidentSnapshot(await loadIncidentEntries(20));
  const diagnosticsReady = await fileExists(dataPath('config.json'));
  const offlineSecretConfigured = Boolean(process.env['PRO5_OFFLINE_SECRET'] || process.env['OFFLINE_SECRET']);
  const codeSigningConfigured = Boolean(process.env['CSC_LINK']);
  const supportPagesReady = await getSupportPagesReady();
  const releaseRuntime = isProductionLikeRuntime();

  const warnings = [
    !diagnosticsReady ? 'Base configuration file is missing.' : null,
    releaseRuntime && !codeSigningConfigured ? 'CSC_LINK is not configured; Windows builds may show SmartScreen warnings.' : null,
    releaseRuntime && !supportPagesReady ? 'Public support/legal pages are incomplete.' : null,
  ].filter((item): item is string => Boolean(item));

  return {
    appVersion: process.env['npm_package_version'] ?? '1.0.0',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSeconds: process.uptime(),
    dataDir: dataPath(),
    logFileCount: logFiles.length,
    diagnosticsReady,
    offlineSecretConfigured,
    codeSigningConfigured,
    supportPagesReady,
    onboardingCompleted: config.onboardingCompleted,
    onboardingState,
    profileCount: profiles.length,
    proxyCount: proxies.length,
    backupCount: backups.length,
    feedbackCount: feedbackEntries.length,
    lastFeedbackAt: feedbackEntries[0]?.createdAt ?? null,
    usageMetrics,
    recentIncidentCount: recentIncidents.count,
    recentErrorCount: recentIncidents.summary.errorCount,
    lastIncidentAt: recentIncidents.timeline[0]?.timestamp ?? null,
    recentIncidentTopCategory: recentIncidents.summary.topCategory,
    recentIncidentCategories: recentIncidents.summary.categories,
    releaseReady: diagnosticsReady && supportPagesReady,
    warnings,
  };
}

export async function createSupportSelfTest(deps: SupportSelfTestDeps): Promise<SupportSelfTestPayload> {
  const checks: SelfTestCheck[] = [];
  const config = deps.getConfig();
  const profilesDirExists = await fileExists(config.profilesDir);
  checks.push({
    key: 'profiles-dir',
    label: 'Profiles directory',
    status: profilesDirExists ? 'pass' : 'fail',
    detail: profilesDirExists ? config.profilesDir : `Missing: ${config.profilesDir}`,
  });

  await deps.refreshRuntimeAvailability();
  const runtimes = deps.listRuntimes();
  const availableRuntimes = runtimes.filter((runtime) => runtime.available);
  checks.push({
    key: 'runtime',
    label: 'Browser runtime',
    status: availableRuntimes.length > 0 ? 'pass' : 'fail',
    detail: availableRuntimes.length > 0
      ? `${availableRuntimes.length}/${runtimes.length} runtime(s) available`
      : 'No configured browser runtime is available.',
  });

  const diagnosticsReady = await fileExists(dataPath('config.json'));
  checks.push({
    key: 'diagnostics',
    label: 'Diagnostics export',
    status: diagnosticsReady ? 'pass' : 'fail',
    detail: diagnosticsReady ? 'Base config detected, diagnostics export is available.' : 'Base config is missing.',
  });

  const supportPagesReady = await getSupportPagesReady();
  checks.push({
    key: 'support-pages',
    label: 'Public support/legal pages',
    status: supportPagesReady ? 'pass' : 'warn',
    detail: supportPagesReady ? 'Support, privacy, and terms pages are present.' : 'One or more support/legal pages are missing.',
  });

  checks.push({
    key: 'proxy-store',
    label: 'Proxy store',
    status: 'pass',
    detail: `${deps.listProxies().length} proxy configuration(s) loaded.`,
  });

  const hasFailure = checks.some((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warn');

  return {
    status: hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass',
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export async function buildSupportStatus(): Promise<SupportStatusPayload> {
  const { configManager } = await import('../config/ConfigManager');
  const { profileManager } = await import('../profiles/ProfileManager');
  const { proxyManager } = await import('../proxies/ProxyManager');
  const { backupManager } = await import('../backups/BackupManager');
  const { usageMetricsManager } = await import('../../core/telemetry/UsageMetricsManager');
  const { supportInboxManager } = await import('./SupportInboxManager');
  const { onboardingStateManager } = await import('./OnboardingStateManager');

  return createSupportStatus({
    getConfig: () => configManager.get(),
    listProfiles: () => profileManager.listProfiles(),
    listProxies: () => proxyManager.listProxies(),
    listBackups: () => backupManager.listBackups(),
    initializeUsageMetrics: () => usageMetricsManager.initialize(),
    getUsageMetricsSnapshot: () => usageMetricsManager.getSnapshot(),
    initializeOnboardingState: () => onboardingStateManager.initialize(),
    getOnboardingSnapshot: () => onboardingStateManager.getSnapshot(),
    listFeedback: (limit) => supportInboxManager.listFeedback(limit),
  });
}

export async function buildSupportSelfTest(): Promise<SupportSelfTestPayload> {
  const { configManager } = await import('../config/ConfigManager');
  const { runtimeManager } = await import('../runtimes/RuntimeManager');
  const { proxyManager } = await import('../proxies/ProxyManager');

  return createSupportSelfTest({
    getConfig: () => configManager.get(),
    refreshRuntimeAvailability: () => runtimeManager.refreshAvailability(),
    listRuntimes: () => runtimeManager.listRuntimes(),
    listProxies: () => proxyManager.listProxies(),
  });
}
