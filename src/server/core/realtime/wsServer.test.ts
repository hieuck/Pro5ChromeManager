import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const { EventEmitter: HoistedEventEmitter } = require('events') as typeof import('events');
  const OPEN_STATE = 1;

  class FakeWebSocketServer extends HoistedEventEmitter {
    readonly close = vi.fn();
    readonly clients = new Set<{
      readyState: number;
      send: ReturnType<typeof vi.fn>;
    }>();
    readonly options: { path: string; server: unknown };

    constructor(options: { path: string; server: unknown }) {
      super();
      this.options = options;
      mocks.lastServer = this;
    }
  }

  return {
    FakeWebSocketServer,
    OPEN_STATE,
    lastServer: null as FakeWebSocketServer | null,
    loggerDebug: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock('ws', () => ({
  WebSocket: {
    OPEN: mocks.OPEN_STATE,
  },
  WebSocketServer: mocks.FakeWebSocketServer,
}));

vi.mock('../logging/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}));

describe('wsServer', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.lastServer = null;
    mocks.loggerDebug.mockClear();
    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
  });

  it('attaches a websocket server and logs client lifecycle events', async () => {
    const { wsServer } = await import('./wsServer');

    wsServer.attach({} as never);
    expect(mocks.lastServer?.options.path).toBe('/ws');
    expect(mocks.loggerInfo).toHaveBeenCalledWith('WebSocket server attached at /ws');

    const client = new EventEmitter() as EventEmitter & { readyState: number };
    client.readyState = mocks.OPEN_STATE;
    mocks.lastServer?.emit('connection', client, {
      socket: { remoteAddress: '127.0.0.1' },
    });

    client.emit('error', new Error('broken pipe'));
    client.emit('close');

    expect(mocks.loggerDebug).toHaveBeenCalledWith('WebSocket client connected', { ip: '127.0.0.1' });
    expect(mocks.loggerWarn).toHaveBeenCalledWith('WebSocket client error', { error: 'broken pipe' });
    expect(mocks.loggerDebug).toHaveBeenCalledWith('WebSocket client disconnected');
  });

  it('broadcasts events only to open websocket clients and tears down cleanly', async () => {
    const { wsServer } = await import('./wsServer');

    wsServer.attach({} as never);

    const openClient = {
      readyState: mocks.OPEN_STATE,
      send: vi.fn(),
    };
    const closedClient = {
      readyState: 0,
      send: vi.fn(),
    };

    mocks.lastServer?.clients.add(openClient);
    mocks.lastServer?.clients.add(closedClient);

    wsServer.broadcast({
      type: 'instance:started',
      payload: { profileId: 'profile-1', status: 'running', port: 9222 },
    });

    expect(openClient.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'instance:started',
      payload: { profileId: 'profile-1', status: 'running', port: 9222 },
    }));
    expect(closedClient.send).not.toHaveBeenCalled();

    wsServer.close();
    expect(mocks.lastServer?.close).toHaveBeenCalledOnce();
  });
});
