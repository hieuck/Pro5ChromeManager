// ─── Shared Types ────────────────────────────────────────────────────────────
// Types used by both server and UI. Single source of truth.

// ─── Logs ────────────────────────────────────────────────────────────────────

export interface OpsLogEntry {
  timestamp: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string | null;
  raw: string;
}

// ─── Support / Incidents ─────────────────────────────────────────────────────

export type IncidentCategory =
  | 'electron-process'
  | 'renderer-navigation'
  | 'startup-readiness'
  | 'runtime-launch'
  | 'proxy'
  | 'extension'
  | 'cookies'
  | 'profile-package'
  | 'onboarding'
  | 'support'
  | 'general';

export type IncidentLevel = 'warn' | 'error';

export interface IncidentEntry {
  timestamp: string;
  level: IncidentLevel;
  source: string;
  message: string;
  category: IncidentCategory;
  categoryLabel: string;
  fingerprint: string;
}

export interface IncidentCategorySummary {
  category: IncidentCategory;
  label: string;
  count: number;
  errorCount: number;
  warnCount: number;
  latestAt: string | null;
}

export interface SupportIncidentsResult {
  count: number;
  incidents: IncidentEntry[];
  summary: {
    total: number;
    errorCount: number;
    warnCount: number;
    topCategory: IncidentCategory | null;
    categories: IncidentCategorySummary[];
  };
  timeline: IncidentEntry[];
}

export type IncidentSnapshot = SupportIncidentsResult;

// ─── Self-Test ───────────────────────────────────────────────────────────────

export interface SelfTestCheck {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface SelfTestResult {
  status: 'pass' | 'warn' | 'fail';
  checkedAt: string;
  checks: SelfTestCheck[];
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export interface SupportFeedbackEntry {
  id: string;
  createdAt: string;
  category: 'bug' | 'feedback' | 'question';
  sentiment: 'negative' | 'neutral' | 'positive';
  message: string;
  email: string | null;
  appVersion: string | null;
}

export interface SupportFeedbackResult {
  count: number;
  entries: SupportFeedbackEntry[];
}

// ─── Backup ──────────────────────────────────────────────────────────────────

export interface BackupEntry {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

export interface RuntimeEntry {
  key: string;
  name?: string;
  label?: string;
  available: boolean;
  executablePath?: string | null;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingState {
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
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

export interface FingerprintConfig {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  canvas: { noise: number; seed: number };
  webgl: { renderer: string; vendor: string; noise: number };
  audio: { noise: number };
  fonts: string[];
  webrtcPolicy: 'default' | 'disable_non_proxied_udp' | 'proxy_only';
}

export interface BrowserIdentityConfig {
  profileId: string;
  profileName: string;
  profileGroup?: string | null;
  profileOwner?: string | null;
}

export interface ManagedCookie {
  id?: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None' | null;
  createdAt?: string;
}

export interface ManagedExtension {
  id: string;
  name: string;
  sourcePath: string;
  entryPath: string;
  version: string | null;
  description: string | null;
  category: string | null;
  enabled: boolean;
  defaultForNewProfiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionBundle {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppConfig {
  uiLanguage: string;
  profilesDir: string;
  headless: boolean;
  windowTitleSuffixEnabled: boolean;
  api: { host: string; port: number };
  sessionCheck: { enabledByDefault: boolean; headless: boolean; timeoutMs: number };
  runtimes: Record<string, { label: string; executablePath: string }>;
  onboardingCompleted?: boolean;
}

export interface BrowserCore {
  id: string;
  key: string;
  label: string;
  version: string;
  channel: string | null;
  platform: string | null;
  executablePath: string;
  managedRuntimeKey: string;
  installedAt: string;
}

export interface BrowserCoreCatalogEntry {
  key: string;
  label: string;
  channel: string;
  platform: string;
  version: string | null;
  status: 'planned' | 'package-ready';
  artifactUrl: string | null;
  notes: string;
  installed: boolean;
  installedCoreId: string | null;
}

export interface SupportStatus {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  dataDir: string;
  logFileCount: number;
  diagnosticsReady: boolean;
  offlineSecretConfigured: boolean;
  codeSigningConfigured: boolean;
  supportPagesReady: boolean;
  onboardingCompleted: boolean;
  onboardingState: OnboardingState & { status: OnboardingState['status'] | null };
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
  recentIncidentTopCategory: string | null;
  recentIncidentCategories: IncidentCategorySummary[];
  releaseReady: boolean;
  warnings: string[];
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export interface ProxyConfig {
  id: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  lastCheckAt?: string;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

export interface Profile {
  id: string;
  schemaVersion: number;
  name: string;
  notes: string;
  tags: string[];
  group: string | null;
  owner: string | null;
  runtime: string;
  proxy: ProxyConfig | null;
  extensionIds: string[];
  bookmarks: Array<{ name: string; url: string; folder?: string | null }>;
  fingerprint: FingerprintConfig;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  totalSessions: number;
}

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

export interface SearchQuery {
  name?: string;
  tags?: string[];
  group?: string;
  owner?: string;
}
