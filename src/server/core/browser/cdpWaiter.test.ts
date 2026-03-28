import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type FakeRequest = EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
  };

  type FakeResponse = EventEmitter & {
    resume: ReturnType<typeof vi.fn>;
    statusCode?: number;
  };

  const requests: FakeRequest[] = [];
  const responders: Array<(response: FakeResponse) => void> = [];
  const options: Array<Record<string, unknown>> = [];

  const get = vi.fn((requestOptions: Record<string, unknown>, responder: (response: FakeResponse) => void) => {
    const request = new EventEmitter() as FakeRequest;
    request.destroy = vi.fn();

    requests.push(request);
    responders.push(responder);
    options.push(requestOptions);
    return request;
  });

  const createResponse = (statusCode: number): FakeResponse => {
    const response = new EventEmitter() as FakeResponse;
    response.resume = vi.fn();
    response.statusCode = statusCode;
    return response;
  };

  return {
    createResponse,
    get,
    options,
    requests,
    responders,
  };
});

vi.mock('http', () => ({
  default: {
    get: mocks.get,
  },
  get: mocks.get,
}));

describe('waitForCDP', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.get.mockClear();
    mocks.requests.length = 0;
    mocks.responders.length = 0;
    mocks.options.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the CDP version endpoint responds with HTTP 200', async () => {
    const { waitForCDP } = await import('./cdpWaiter');

    const readinessPromise = waitForCDP(9222, 2_000);
    const response = mocks.createResponse(200);
    mocks.responders[0]?.(response);

    await expect(readinessPromise).resolves.toBeUndefined();
    expect(mocks.options[0]).toMatchObject({
      host: '127.0.0.1',
      path: '/json/version',
      port: 9222,
      timeout: 500,
    });
    expect(response.resume).toHaveBeenCalledOnce();
  });

  it('keeps polling until the endpoint becomes ready', async () => {
    const { waitForCDP } = await import('./cdpWaiter');

    const readinessPromise = waitForCDP(9333, 2_000);
    const firstResponse = mocks.createResponse(503);
    mocks.responders[0]?.(firstResponse);
    await vi.advanceTimersByTimeAsync(500);

    const secondResponse = mocks.createResponse(200);
    mocks.responders[1]?.(secondResponse);

    await expect(readinessPromise).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(firstResponse.resume).toHaveBeenCalledOnce();
    expect(secondResponse.resume).toHaveBeenCalledOnce();
  });

  it('retries after request errors and rejects when the deadline is exceeded', async () => {
    const { waitForCDP } = await import('./cdpWaiter');

    const readinessPromise = waitForCDP(9444, 900).catch((error) => error);
    mocks.requests[0]?.emit('error', new Error('ECONNREFUSED'));
    await vi.advanceTimersByTimeAsync(500);

    mocks.requests[1]?.emit('timeout');
    await vi.advanceTimersByTimeAsync(500);

    const error = await readinessPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('CDP not ready on port 9444 after 900ms');
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
