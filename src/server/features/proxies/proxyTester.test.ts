import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyConfig } from '../../../shared/contracts';

const mocks = vi.hoisted(() => {
  const { EventEmitter } = require('events') as typeof import('events');

  type FakeRequest = InstanceType<typeof EventEmitter> & {
    destroy: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  type FakeResponse = InstanceType<typeof EventEmitter>;
  type FakeTlsSocket = InstanceType<typeof EventEmitter> & {
    write: ReturnType<typeof vi.fn>;
  };

  const httpGetResponders: Array<(response: FakeResponse) => void> = [];
  const httpGetOptions: unknown[] = [];
  const httpRequests: FakeRequest[] = [];
  const connectRequests: FakeRequest[] = [];
  const tlsSockets: FakeTlsSocket[] = [];

  const createRequest = (): FakeRequest => {
    const request = new EventEmitter() as FakeRequest;
    request.destroy = vi.fn();
    request.end = vi.fn();
    return request;
  };

  const createResponse = (): FakeResponse => new EventEmitter() as FakeResponse;

  const httpGet = vi.fn((first: unknown, second: unknown, third?: unknown) => {
    const request = createRequest();
    const responder = (typeof third === 'function' ? third : second) as (response: FakeResponse) => void;
    httpGetOptions.push(typeof third === 'function' ? [first, second] : first);
    httpGetResponders.push(responder);
    httpRequests.push(request);
    return request;
  });

  const httpRequest = vi.fn((options: unknown) => {
    const request = createRequest();
    httpGetOptions.push(options);
    connectRequests.push(request);
    return request;
  });

  const tlsConnect = vi.fn((_options: unknown, onSecureConnect?: () => void) => {
    const socket = new EventEmitter() as FakeTlsSocket;
    socket.write = vi.fn();
    tlsSockets.push(socket);
    queueMicrotask(() => {
      onSecureConnect?.();
    });
    return socket;
  });

  return {
    anonymizeProxy: vi.fn(),
    closeAnonymizedProxy: vi.fn(),
    connectRequests,
    createResponse,
    httpGet,
    httpGetOptions,
    httpGetResponders,
    httpRequest,
    httpRequests,
    tlsConnect,
    tlsSockets,
  };
});

vi.mock('http', () => ({
  default: {
    get: mocks.httpGet,
    request: mocks.httpRequest,
  },
  get: mocks.httpGet,
  request: mocks.httpRequest,
}));

vi.mock('https', () => ({
  default: {
    get: mocks.httpGet,
  },
  get: mocks.httpGet,
}));

vi.mock('tls', () => ({
  connect: mocks.tlsConnect,
}));

vi.mock('proxy-chain', () => ({
  anonymizeProxy: mocks.anonymizeProxy,
  closeAnonymizedProxy: mocks.closeAnonymizedProxy,
}));

describe('ProxyTester', () => {
  const httpProxy: ProxyConfig = {
    id: 'proxy-http',
    type: 'http',
    host: 'proxy.example',
    port: 8080,
    username: 'user',
    password: 'pass',
  };

  beforeEach(() => {
    vi.resetModules();
    mocks.anonymizeProxy.mockReset();
    mocks.closeAnonymizedProxy.mockReset();
    mocks.closeAnonymizedProxy.mockResolvedValue(undefined);
    mocks.httpGet.mockClear();
    mocks.httpRequest.mockClear();
    mocks.connectRequests.length = 0;
    mocks.httpGetOptions.length = 0;
    mocks.httpGetResponders.length = 0;
    mocks.httpRequests.length = 0;
    mocks.tlsSockets.length = 0;
  });

  it('tests a standard HTTP proxy by routing the ipify request through the proxy', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();
    const httpGetViaProxySpy = vi.spyOn(
      tester as unknown as {
        httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
      },
      'httpGetViaProxy',
    ).mockResolvedValue(JSON.stringify({ ip: '203.0.113.9' }));

    await expect(tester.testProxy(httpProxy)).resolves.toBe('203.0.113.9');
    expect(httpGetViaProxySpy).toHaveBeenCalledWith('https://api.ipify.org?format=json', httpProxy, 10_000);
  });

  it('routes plain HTTP targets through the proxy transport options', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const resultPromise = (tester as unknown as {
      httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
    }).httpGetViaProxy('http://status.example.com/health?ok=1', httpProxy, 10_000);

    const response = mocks.createResponse();
    mocks.httpGetResponders[0]?.(response);
    response.emit('data', Buffer.from('healthy'));
    response.emit('end');

    await expect(resultPromise).resolves.toBe('healthy');
    expect(mocks.httpGetOptions[0]).toMatchObject({
      host: 'proxy.example',
      port: 8080,
      path: 'http://status.example.com/health?ok=1',
      timeout: 10_000,
      headers: {
        Host: 'status.example.com',
        'Proxy-Authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`,
      },
    });
  });

  it('anonymizes SOCKS proxies before testing and always closes the local proxy', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();
    const httpGetViaProxySpy = vi.spyOn(
      tester as unknown as {
        httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
      },
      'httpGetViaProxy',
    ).mockResolvedValue(JSON.stringify({ ip: '198.51.100.10' }));
    const socksProxy: ProxyConfig = {
      id: 'proxy-socks',
      type: 'socks5',
      host: 'socks.example',
      port: 1080,
      username: 'sock-user',
      password: 'sock-pass',
    };

    mocks.anonymizeProxy.mockResolvedValue('http://127.0.0.1:19090');

    await expect(tester.testProxy(socksProxy)).resolves.toBe('198.51.100.10');
    expect(mocks.anonymizeProxy).toHaveBeenCalledWith('socks5://sock-user:sock-pass@socks.example:1080');
    expect(mocks.closeAnonymizedProxy).toHaveBeenCalledWith('http://127.0.0.1:19090', true);
    expect(httpGetViaProxySpy).toHaveBeenCalledWith('https://api.ipify.org?format=json', {
      host: '127.0.0.1',
      id: 'proxy-socks',
      port: 19090,
      type: 'http',
    }, 10_000);
  });

  it('detects timezones via the public ipapi endpoint', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();
    const httpGetSpy = vi.spyOn(
      tester as unknown as {
        httpGet: (url: string, timeoutMs: number) => Promise<string>;
      },
      'httpGet',
    ).mockResolvedValue('Asia/Bangkok\n');

    await expect(tester.detectTimezone('203.0.113.9')).resolves.toBe('Asia/Bangkok');
    expect(httpGetSpy).toHaveBeenCalledWith('https://ipapi.co/203.0.113.9/timezone', 5_000);
  });

  it('performs direct HTTP gets with timeout-aware transport selection', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const requestPromise = (tester as unknown as {
      httpGet: (url: string, timeoutMs: number) => Promise<string>;
    }).httpGet('https://example.com/timezone', 5_000);

    const response = mocks.createResponse();
    mocks.httpGetResponders[0]?.(response);
    response.emit('data', Buffer.from('Asia/Bangkok'));
    response.emit('end');

    await expect(requestPromise).resolves.toBe('Asia/Bangkok');
    expect(mocks.httpGetOptions[0]).toEqual([
      'https://example.com/timezone',
      { timeout: 5_000 },
    ]);
  });

  it('rejects direct HTTP gets when the request times out', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const requestPromise = (tester as unknown as {
      httpGet: (url: string, timeoutMs: number) => Promise<string>;
    }).httpGet('http://example.com/timezone', 2_000);

    mocks.httpRequests[0]?.emit('timeout');

    await expect(requestPromise).rejects.toThrow('Request timed out');
    expect(mocks.httpRequests[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('turns low-level request errors into rejected proxy reads', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const resultPromise = (tester as unknown as {
      httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
    }).httpGetViaProxy('http://status.example.com/health', httpProxy, 10_000);

    mocks.httpRequests[0]?.emit('error', new Error('socket hang up'));

    await expect(resultPromise).rejects.toThrow('socket hang up');
  });

  it('routes HTTPS targets through CONNECT and strips response headers from the tunneled body', async () => {
    const { EventEmitter } = require('events') as typeof import('events');
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const resultPromise = (tester as unknown as {
      httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
    }).httpGetViaProxy('https://secure.example.com/health?ok=1', httpProxy, 10_000);

    const socket = new EventEmitter();
    mocks.connectRequests[0]?.emit('connect', {}, socket);
    await Promise.resolve();

    const tlsSocket = mocks.tlsSockets[0];
    expect(tlsSocket?.write).toHaveBeenCalledWith(
      'GET /health?ok=1 HTTP/1.1\r\nHost: secure.example.com\r\nConnection: close\r\n\r\n',
    );
    expect(mocks.httpGetOptions[0]).toMatchObject({
      host: 'proxy.example',
      port: 8080,
      method: 'CONNECT',
      path: 'secure.example.com:443',
      timeout: 10_000,
      headers: {
        'Proxy-Authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`,
      },
    });

    tlsSocket?.emit('data', Buffer.from('HTTP/1.1 200 OK\r\nHeader: value\r\n\r\nbody'));
    tlsSocket?.emit('end');

    await expect(resultPromise).resolves.toBe('body');
  });

  it('rejects HTTPS proxy reads when the CONNECT tunnel times out', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    const resultPromise = (tester as unknown as {
      httpGetViaProxy: (url: string, proxy: ProxyConfig, timeoutMs: number) => Promise<string>;
    }).httpGetViaProxy('https://secure.example.com/health', httpProxy, 10_000);
    const expectation = expect(resultPromise).rejects.toThrow('Proxy connect timed out');

    mocks.connectRequests[0]?.emit('timeout');

    await expectation;
    expect(mocks.connectRequests[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('builds proxy URLs without leaking empty credentials', async () => {
    const { ProxyTester } = await import('./proxyTester');
    const tester = new ProxyTester();

    expect((tester as unknown as { buildProxyUrl: (proxy: ProxyConfig) => string }).buildProxyUrl(httpProxy))
      .toBe('http://user:pass@proxy.example:8080');
    expect((tester as unknown as { buildProxyUrl: (proxy: ProxyConfig) => string }).buildProxyUrl({
      ...httpProxy,
      password: undefined,
      type: 'socks4',
      username: undefined,
    })).toBe('socks4://proxy.example:8080');
  });
});
