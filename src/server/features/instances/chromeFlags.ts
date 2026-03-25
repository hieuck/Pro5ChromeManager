/**
 * Pure function builder for browser command-line arguments.
 */
export function buildChromeFlags(opts: {
  userDataDir: string;
  remoteDebuggingPort: number;
  extensionDirs: string[];
  proxyFlag: string | null;
  headless: boolean;
  webrtcPolicy: string;
}): string[] {
  const flags: string[] = [
    `--user-data-dir=${opts.userDataDir}`,
    `--remote-debugging-port=${opts.remoteDebuggingPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-apps',
    '--mute-audio',
    `--webrtc-ip-handling-policy=${opts.webrtcPolicy}`,
  ];

  if (opts.extensionDirs.length > 0) {
    const extensionArg = Array.from(new Set(opts.extensionDirs)).join(',');
    flags.push(`--disable-extensions-except=${extensionArg}`);
    flags.push(`--load-extension=${extensionArg}`);
  }

  if (opts.proxyFlag) {
    flags.push(opts.proxyFlag);
  }

  if (opts.headless) {
    flags.push('--headless=new');
    flags.push('--disable-gpu');
  }

  return flags;
}
