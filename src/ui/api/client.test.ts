import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl, buildWebSocketUrl, getApiBaseUrl, getWebSocketBaseUrl } from './client';

const originalWindow = globalThis.window;

function setWindowLocation(protocol: string, host: string, origin: string): void {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        protocol,
        host,
        origin,
      },
    },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { window?: Window }).window;
    return;
  }

  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

describe('client URL helpers', () => {
  it('falls back to the default local API origin when window is unavailable', () => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { window?: Window }).window;

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3210');
    expect(buildApiUrl('/api/logs')).toBe('http://127.0.0.1:3210/api/logs');
  });

  it('builds API URLs from the current browser origin', () => {
    setWindowLocation('http:', '127.0.0.1:33211', 'http://127.0.0.1:33211');

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:33211');
    expect(buildApiUrl('/api/support/diagnostics')).toBe('http://127.0.0.1:33211/api/support/diagnostics');
  });

  it('uses ws for http origins and wss for https origins', () => {
    setWindowLocation('http:', '127.0.0.1:33211', 'http://127.0.0.1:33211');
    expect(getWebSocketBaseUrl()).toBe('ws://127.0.0.1:33211');
    expect(buildWebSocketUrl('/ws')).toBe('ws://127.0.0.1:33211/ws');

    setWindowLocation('https:', 'pro5.example.com', 'https://pro5.example.com');
    expect(getWebSocketBaseUrl()).toBe('wss://pro5.example.com');
    expect(buildWebSocketUrl('/ws')).toBe('wss://pro5.example.com/ws');
  });

  it('falls back to the default local websocket origin when window is unavailable', () => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { window?: Window }).window;

    expect(getWebSocketBaseUrl()).toBe('ws://127.0.0.1:3210');
    expect(buildWebSocketUrl('/ws')).toBe('ws://127.0.0.1:3210/ws');
  });
});
