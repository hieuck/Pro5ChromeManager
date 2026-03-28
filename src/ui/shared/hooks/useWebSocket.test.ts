import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanups: Array<() => void> = [];

const mocks = vi.hoisted(() => ({
  buildWebSocketUrl: vi.fn((path: string) => `ws://127.0.0.1:3210${path}`),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onopen: (() => void) | null = null;
  public readonly url: string;
  public close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
}

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) {
      cleanups.push(cleanup);
    }
  },
  useRef: <T>(initial: T) => ({ current: initial }),
}));

vi.mock('../../api/client', () => ({
  buildWebSocketUrl: mocks.buildWebSocketUrl,
}));

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    cleanups.length = 0;
    FakeWebSocket.instances = [];
    mocks.buildWebSocketUrl.mockClear();
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      cleanup?.();
    }
    vi.useRealTimers();
  });

  it('connects, parses messages, and ignores malformed payloads', async () => {
    const onMessage = vi.fn();

    const { useWebSocket } = await import('./useWebSocket');
    useWebSocket(onMessage);

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];

    socket?.onopen?.();
    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'instance:started',
        payload: {
          profileId: 'profile-1',
          status: 'running',
        },
      }),
    });
    socket?.onmessage?.({ data: 'not-json' });

    expect(mocks.buildWebSocketUrl).toHaveBeenCalledWith('/ws');
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      type: 'instance:started',
      payload: {
        profileId: 'profile-1',
        status: 'running',
      },
    });
  });

  it('reconnects with exponential backoff after close events', async () => {
    const { useWebSocket } = await import('./useWebSocket');
    useWebSocket(vi.fn());

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    const secondSocket = FakeWebSocket.instances[1];
    expect(FakeWebSocket.instances).toHaveLength(2);

    secondSocket?.onclose?.();
    await vi.advanceTimersByTimeAsync(2000);

    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('closes the active socket and cancels reconnects during cleanup', async () => {
    const { useWebSocket } = await import('./useWebSocket');
    useWebSocket(vi.fn());

    const socket = FakeWebSocket.instances[0];
    socket?.onclose?.();

    const cleanup = cleanups.pop();
    cleanup?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(socket?.close).toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('closes the socket when the error handler fires', async () => {
    const { useWebSocket } = await import('./useWebSocket');
    useWebSocket(vi.fn());

    const socket = FakeWebSocket.instances[0];
    socket?.onerror?.();

    expect(socket?.close).toHaveBeenCalled();
  });
});
