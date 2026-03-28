import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

import { ProcessManager } from './processManager';

type FakeChildProcess = EventEmitter & {
  pid?: number;
  kill: ReturnType<typeof vi.fn>;
  once: EventEmitter['once'];
};

function createChildProcess(pid?: number): FakeChildProcess {
  const emitter = new EventEmitter() as FakeChildProcess;
  emitter.pid = pid;
  emitter.kill = vi.fn();
  return emitter;
}

function asChildProcess(child: FakeChildProcess): ChildProcess {
  return child as unknown as ChildProcess;
}

describe('ProcessManager', () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
    mocks.loggerWarn.mockReset();
    vi.restoreAllMocks();
  });

  it('delegates spawning with the expected process options', () => {
    const child = createChildProcess(1234);
    mocks.spawn.mockReturnValue(child);

    const manager = new ProcessManager();
    const result = manager.spawn('chrome.exe', ['--flag']);

    expect(result).toBe(child);
    expect(mocks.spawn).toHaveBeenCalledWith('chrome.exe', ['--flag'], {
      detached: false,
      stdio: 'ignore',
    });
  });

  it('kills an existing child process with the requested signal', () => {
    const manager = new ProcessManager();
    const child = createChildProcess(2222);
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    manager.kill(asChildProcess(child), 'SIGKILL');

    expect(processKillSpy).toHaveBeenCalledWith(2222, 0);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('logs and swallows kill failures', () => {
    const manager = new ProcessManager();
    const child = createChildProcess(3333);
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    child.kill.mockImplementation(() => {
      throw new Error('permission denied');
    });

    manager.kill(asChildProcess(child), 'SIGTERM');

    expect(processKillSpy).toHaveBeenCalledWith(3333, 0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith('ProcessManager: failed to kill process', {
      pid: 3333,
      signal: 'SIGTERM',
      error: 'permission denied',
    });
  });

  it('reports whether a pid exists based on signal-0 probing', () => {
    const manager = new ProcessManager();
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    expect(manager.exists(4444)).toBe(true);
    expect(processKillSpy).toHaveBeenCalledWith(4444, 0);

    processKillSpy.mockImplementation(() => {
      throw new Error('missing');
    });
    expect(manager.exists(5555)).toBe(false);
  });

  it('waits for an exit event without forcing SIGKILL', async () => {
    vi.useFakeTimers();

    try {
      const manager = new ProcessManager();
      const child = createChildProcess(6666);
      const waitPromise = manager.waitForExit(asChildProcess(child), 5_000);

      child.emit('exit');
      await waitPromise;

      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('forces SIGKILL after the timeout elapses', async () => {
    vi.useFakeTimers();

    try {
      const manager = new ProcessManager();
      const child = createChildProcess(7777);
      const waitPromise = manager.waitForExit(asChildProcess(child), 2_000);

      await vi.advanceTimersByTimeAsync(2_000);
      await waitPromise;

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });
});
