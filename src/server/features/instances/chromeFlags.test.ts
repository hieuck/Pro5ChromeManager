import { describe, expect, it } from 'vitest';
import { buildChromeFlags } from './chromeFlags';

describe('buildChromeFlags', () => {
  it('builds the stable baseline flags for a standard launch', () => {
    expect(buildChromeFlags({
      userDataDir: 'E:/profiles/demo',
      remoteDebuggingPort: 45678,
      extensionDirs: [],
      proxyFlag: null,
      headless: false,
      webrtcPolicy: 'disable_non_proxied_udp',
    })).toEqual([
      '--user-data-dir=E:/profiles/demo',
      '--remote-debugging-port=45678',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--mute-audio',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    ]);
  });

  it('deduplicates extension directories and appends proxy/headless flags when enabled', () => {
    expect(buildChromeFlags({
      userDataDir: 'E:/profiles/demo',
      remoteDebuggingPort: 45679,
      extensionDirs: ['E:/extensions/a', 'E:/extensions/a', 'E:/extensions/b'],
      proxyFlag: '--proxy-server=http://127.0.0.1:9000',
      headless: true,
      webrtcPolicy: 'default_public_interface_only',
    })).toEqual([
      '--user-data-dir=E:/profiles/demo',
      '--remote-debugging-port=45679',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--mute-audio',
      '--webrtc-ip-handling-policy=default_public_interface_only',
      '--disable-extensions-except=E:/extensions/a,E:/extensions/b',
      '--load-extension=E:/extensions/a,E:/extensions/b',
      '--proxy-server=http://127.0.0.1:9000',
      '--headless=new',
      '--disable-gpu',
    ]);
  });
});
