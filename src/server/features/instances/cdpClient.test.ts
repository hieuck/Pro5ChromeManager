import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCookie } from '../../../shared/contracts';

const mocks = vi.hoisted(() => {
  const { EventEmitter: HoistedEventEmitter } = require('events') as typeof import('events');

  type FakeRequest = EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
  };

  type FakeResponse = EventEmitter & {
    resume: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
    statusCode?: number;
  };

  class FakeWebSocket extends HoistedEventEmitter {
    readonly url: string;
    readonly send = vi.fn();
    readonly close = vi.fn();

    constructor(url: string) {
      super();
      this.url = url;
      mocks.sockets.push(this);
    }
  }

  const requests: FakeRequest[] = [];
  const responders: Array<(response: FakeResponse) => void> = [];
  const options: Array<Record<string, unknown>> = [];
  const sockets: FakeWebSocket[] = [];

  const get = vi.fn((requestOptions: Record<string, unknown>, responder: (response: FakeResponse) => void) => {
    const request = new HoistedEventEmitter() as FakeRequest;
    request.destroy = vi.fn((error?: Error) => {
      if (error) {
        queueMicrotask(() => {
          request.emit('error', error);
        });
      }
    });

    requests.push(request);
    responders.push(responder);
    options.push(requestOptions);
    return request;
  });

  const createResponse = (): FakeResponse => {
    const response = new HoistedEventEmitter() as FakeResponse;
    response.resume = vi.fn();
    response.setEncoding = vi.fn();
    return response;
  };

  return {
    FakeWebSocket,
    createResponse,
    get,
    options,
    requests,
    responders,
    sockets,
  };
});

vi.mock('http', () => ({
  default: {
    get: mocks.get,
  },
  get: mocks.get,
}));

vi.mock('ws', () => ({
  default: mocks.FakeWebSocket,
}));

describe('CDPClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.get.mockClear();
    mocks.requests.length = 0;
    mocks.responders.length = 0;
    mocks.options.length = 0;
    mocks.sockets.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first page target websocket debugger url', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const resultPromise = client.getPageWebSocketUrl(9222);
    const response = mocks.createResponse();
    mocks.responders[0]?.(response);
    response.emit('data', JSON.stringify([
      { type: 'service_worker', webSocketDebuggerUrl: 'ws://ignored' },
      { type: 'page', webSocketDebuggerUrl: 'ws://page-target' },
    ]));
    response.emit('end');

    await expect(resultPromise).resolves.toBe('ws://page-target');
    expect(response.setEncoding).toHaveBeenCalledWith('utf8');
    expect(mocks.options[0]).toMatchObject({
      host: '127.0.0.1',
      path: '/json/list',
      port: 9222,
      timeout: 5000,
    });
  });

  it('rejects when the target list payload is invalid JSON', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const resultPromise = client.getPageWebSocketUrl(9222);
    const response = mocks.createResponse();
    mocks.responders[0]?.(response);
    response.emit('data', 'not-json');
    response.emit('end');

    await expect(resultPromise).rejects.toThrow();
  });

  it('fails the target lookup request on timeout', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const resultPromise = client.getPageWebSocketUrl(9555);
    mocks.requests[0]?.emit('timeout');

    await expect(resultPromise).rejects.toThrow('Timed out loading CDP targets from port 9555');
  });

  it('sends the full command sequence and resolves after the final response', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();
    const commands = [
      { method: 'Network.enable' },
      { method: 'Network.setCookies', params: { cookies: [{ name: 'session' }] } },
    ];

    const resultPromise = client.sendCommandSequence('ws://debug-target', commands);
    const socket = mocks.sockets[0];

    socket?.emit('open');
    expect(socket?.send).toHaveBeenNthCalledWith(1, JSON.stringify({
      id: 1,
      method: 'Network.enable',
      params: {},
    }));
    expect(socket?.send).toHaveBeenNthCalledWith(2, JSON.stringify({
      id: 2,
      method: 'Network.setCookies',
      params: { cookies: [{ name: 'session' }] },
    }));

    socket?.emit('message', Buffer.from(JSON.stringify({ id: 2 })));

    await expect(resultPromise).resolves.toBeUndefined();
    expect(socket?.close).toHaveBeenCalledOnce();
  });

  it('rejects a websocket command sequence when CDP reports an error', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const resultPromise = client.sendCommandSequence('ws://debug-target', [{ method: 'Page.enable' }]);
    const socket = mocks.sockets[0];
    socket?.emit('open');
    socket?.emit('message', Buffer.from(JSON.stringify({
      error: { message: 'forbidden' },
    })));

    await expect(resultPromise).rejects.toThrow('forbidden');
    expect(socket?.close).toHaveBeenCalledOnce();
  });

  it('returns the first page url and falls back to an empty string on failures', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const firstUrlPromise = client.getCurrentUrl(9666, 2_000);
    const firstResponse = mocks.createResponse();
    mocks.responders[0]?.(firstResponse);
    firstResponse.emit('data', Buffer.from(JSON.stringify([
      { type: 'other', url: 'chrome://settings' },
      { type: 'page', url: 'https://example.com/dashboard' },
    ])));
    firstResponse.emit('end');

    await expect(firstUrlPromise).resolves.toBe('https://example.com/dashboard');

    const fallbackPromise = client.getCurrentUrl(9667, 2_000);
    mocks.requests[1]?.emit('error', new Error('offline'));
    await expect(fallbackPromise).resolves.toBe('');
  });

  it('reports CDP reachability through the version endpoint', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();

    const successPromise = client.ping(9777);
    const successResponse = mocks.createResponse();
    successResponse.statusCode = 200;
    mocks.responders[0]?.(successResponse);

    await expect(successPromise).resolves.toBe(true);
    expect(successResponse.resume).toHaveBeenCalledOnce();

    const failurePromise = client.ping(9778);
    mocks.requests[1]?.emit('timeout');
    await expect(failurePromise).resolves.toBe(false);
  });

  it('maps managed cookies into the CDP payload shape without empty optional fields', async () => {
    const { CDPClient } = await import('./cdpClient');
    const client = new CDPClient();
    const cookie: ManagedCookie = {
      name: 'session',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      expires: null,
      httpOnly: true,
      secure: true,
      sameSite: null,
    };

    expect(client.toCDPCookie(cookie)).toEqual({
      name: 'session',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
    });
  });
});
