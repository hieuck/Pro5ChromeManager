import type { TranslationKeys } from './vi';

const en: TranslationKeys = {
  // Navigation
  nav: {
    profiles: 'Profiles',
    settings: 'Settings',
    logs: 'Logs',
  },
  // Common
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    actions: 'Actions',
    status: 'Status',
    name: 'Name',
    notes: 'Notes',
    tags: 'Tags',
    group: 'Group',
    createdAt: 'Created At',
    updatedAt: 'Updated At',
  },
  // Profile
  profile: {
    title: 'Profile Manager',
    newProfile: 'New Profile',
    deleteConfirm: 'Are you sure you want to delete this profile?',
    startProfile: 'Start',
    stopProfile: 'Stop',
    proxy: 'Proxy',
    runtime: 'Browser',
    fingerprint: 'Fingerprint',
    lastUsed: 'Last Used',
    totalSessions: 'Total Sessions',
    running: 'Running',
    stopped: 'Stopped',
    unreachable: 'Unreachable',
    stale: 'Stale',
    noProfiles: 'No profiles yet',
    importProfile: 'Import Profile',
    exportProfile: 'Export Profile',
    bulkStart: 'Start Selected',
    bulkStop: 'Stop Selected',
    bulkDelete: 'Delete Selected',
  },
  // Settings
  settings: {
    title: 'Settings',
    general: 'General',
    runtimes: 'Browsers',
    backup: 'Backup',
    logs: 'Logs',
    profilesDir: 'Profiles Directory',
    apiHost: 'API Host',
    apiPort: 'API Port',
    uiLanguage: 'UI Language',
    sessionCheck: 'Session Check',
    sessionCheckEnabled: 'Enable session check by default',
    sessionCheckHeadless: 'Run headless when checking',
    sessionCheckTimeout: 'Timeout (ms)',
    saveSettings: 'Save Settings',
    settingsSaved: 'Settings saved',
  },
  // License
  license: {
    free: 'Free',
    pro: 'Pro',
    expired: 'Expired',
    profilesUsed: '{used}/{limit} profiles',
    activate: 'Activate',
    deactivate: 'Deactivate',
  },
  // Logs
  logs: {
    title: 'System Logs',
    noLogs: 'No logs yet',
    refresh: 'Refresh',
  },
};

export default en;
