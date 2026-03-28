import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../logging/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}));

describe('memoryMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.loggerDebug.mockClear();
    mocks.loggerError.mockClear();
    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('logs memory usage, triggers GC above the high-water mark, and records freed heap', async () => {
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({
        rss: 700 * 1024 * 1024,
        heapTotal: 600 * 1024 * 1024,
        heapUsed: 520 * 1024 * 1024,
        external: 12 * 1024 * 1024,
        arrayBuffers: 4 * 1024 * 1024,
      })
      .mockReturnValueOnce({
        rss: 700 * 1024 * 1024,
        heapTotal: 600 * 1024 * 1024,
        heapUsed: 520 * 1024 * 1024,
        external: 12 * 1024 * 1024,
        arrayBuffers: 4 * 1024 * 1024,
      })
      .mockReturnValueOnce({
        rss: 700 * 1024 * 1024,
        heapTotal: 600 * 1024 * 1024,
        heapUsed: 420 * 1024 * 1024,
        external: 12 * 1024 * 1024,
        arrayBuffers: 4 * 1024 * 1024,
      });
    vi.stubGlobal('gc', vi.fn());

    const { memoryMonitor } = await import('./MemoryMonitor');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.loggerDebug).toHaveBeenCalledWith('Memory usage', {
      rss: 700,
      heapTotal: 600,
      heapUsed: 520,
      external: 12,
      arrayBuffers: 4,
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith('High memory usage detected', expect.objectContaining({
      heapUsed: 520,
    }));
    expect(global.gc).toHaveBeenCalledOnce();
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Manual garbage collection performed', {
      before: 520,
      after: 420,
      freed: 100,
    });

    memoryMonitor.stopMonitoring();
    memoryUsageSpy.mockRestore();
  });

  it('captures heap dumps when critical heap pressure suggests a leak', async () => {
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage')
      .mockReturnValue({
        rss: 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 95 * 1024 * 1024,
        external: 1024,
        arrayBuffers: 1024,
      });
    (process as typeof process & { heapdump?: (fileName: string, callback: (error: Error | null) => void) => void }).heapdump =
      vi.fn((_fileName, callback) => callback(null));

    const { memoryMonitor } = await import('./MemoryMonitor');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.loggerError).toHaveBeenCalledWith('Critical memory usage - potential memory leak', expect.objectContaining({
      heapTotal: 100,
      heapUsed: 95,
    }));
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Heap dump created', {
      filename: expect.stringMatching(/^heapdump-\d+\.heapsnapshot$/),
    });

    memoryMonitor.stopMonitoring();
    memoryUsageSpy.mockRestore();
    delete (process as typeof process & { heapdump?: unknown }).heapdump;
  });

  it('surfaces heap dump creation failures', async () => {
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage')
      .mockReturnValue({
        rss: 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 95 * 1024 * 1024,
        external: 1024,
        arrayBuffers: 1024,
      });
    (process as typeof process & { heapdump?: (fileName: string, callback: (error: Error | null) => void) => void }).heapdump =
      vi.fn((_fileName, callback) => callback(new Error('disk full')));

    const { memoryMonitor } = await import('./MemoryMonitor');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.loggerError).toHaveBeenCalledWith('Failed to create heap dump', { error: 'disk full' });

    memoryMonitor.stopMonitoring();
    memoryUsageSpy.mockRestore();
    delete (process as typeof process & { heapdump?: unknown }).heapdump;
  });
});
