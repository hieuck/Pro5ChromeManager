import { spawn, ChildProcess } from 'child_process';
import { logger } from '../../utils/logger';

/**
 * Handles browser process lifecycle: spawning, killing, and status tracking.
 */
export class ProcessManager {
  spawn(executablePath: string, flags: string[]): ChildProcess {
    return spawn(executablePath, flags, { detached: false, stdio: 'ignore' });
  }

  kill(process: ChildProcess, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): void {
    try {
      if (process.pid && this.exists(process.pid)) {
        process.kill(signal);
      }
    } catch (err) {
      logger.warn('ProcessManager: failed to kill process', {
        pid: process.pid,
        signal,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  exists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async waitForExit(process: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          process.kill('SIGKILL');
        } catch { /* already dead */ }
        resolve();
      }, timeoutMs);

      process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

export const processManager = new ProcessManager();
