import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendFile: vi.fn(),
  dataPath: vi.fn(() => 'E:/data/activity.log'),
  loggerWarn: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    appendFile: mocks.appendFile,
    mkdir: mocks.mkdir,
  },
}));

vi.mock('../../core/fs/dataPaths', () => ({
  dataPath: mocks.dataPath,
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

describe('ActivityLogger', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.appendFile.mockReset();
    mocks.appendFile.mockResolvedValue(undefined);
    mocks.dataPath.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.mkdir.mockReset();
    mocks.mkdir.mockResolvedValue(undefined);
  });

  it('writes structured activity log entries with the computed session duration', async () => {
    const { ActivityLogger } = await import('./activityLogger');
    const activityLogger = new ActivityLogger();

    await activityLogger.append(
      'profile-1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:05.000Z',
    );

    expect(mocks.mkdir).toHaveBeenCalledWith('E:/data', { recursive: true });
    expect(mocks.appendFile).toHaveBeenCalledWith(
      'E:/data/activity.log',
      `${JSON.stringify({
        profileId: 'profile-1',
        startedAt: '2026-01-01T00:00:00.000Z',
        stoppedAt: '2026-01-01T00:00:05.000Z',
        durationMs: 5_000,
      })}\n`,
      'utf-8',
    );
  });

  it('swallows file-system write failures and logs a warning', async () => {
    const { ActivityLogger } = await import('./activityLogger');
    const activityLogger = new ActivityLogger();
    mocks.appendFile.mockRejectedValueOnce(new Error('disk full'));

    await expect(activityLogger.append(
      'profile-1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:05.000Z',
    )).resolves.toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith('ActivityLogger: failed to write activity log', {
      error: 'disk full',
    });
  });
});
