import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, buildApiUrl, buildWebSocketUrl, getApiBaseUrl, getWebSocketBaseUrl } from './client';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

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
  if (originalFetch === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  } else {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  }
  vi.restoreAllMocks();
});

describe('client URL helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it('exposes build helpers on the api client for window-open and raw fetch call sites', () => {
    setWindowLocation('https:', 'pro5.example.com', 'https://pro5.example.com');

    expect(apiClient.buildUrl('/api/backups')).toBe('https://pro5.example.com/api/backups');
    expect(apiClient.buildSocketUrl('/ws')).toBe('wss://pro5.example.com/ws');
  });
});

describe('api client requests', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  });

  it('serializes JSON bodies and returns parsed success payloads', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, data: { id: 'profile-1' } }),
    } as unknown as Response);

    await expect(apiClient.post<{ id: string }>('/api/profiles', { name: 'Alpha' })).resolves.toEqual({
      success: true,
      data: { id: 'profile-1' },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:3210/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha' }),
    });
  });

  it('omits request bodies for GET and DELETE operations', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ success: true, data: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ success: true, data: null }),
      } as unknown as Response);

    await apiClient.get('/api/profiles');
    await apiClient.delete('/api/profiles/profile-1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3210/api/profiles', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3210/api/profiles/profile-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
  });

  it('maps thrown errors into a failed api response envelope', async () => {
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce('offline');

    await expect(apiClient.put('/api/config', { locale: 'vi-VN' })).resolves.toEqual({
      success: false,
      error: 'socket hang up',
    });
    await expect(apiClient.get('/api/profiles')).resolves.toEqual({
      success: false,
      error: 'Network error',
    });
  });
});
