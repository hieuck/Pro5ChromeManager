import type { ChildProcess } from 'child_process';
import type { Instance } from '../../shared/types';

export interface RunningEntry {
  instance: Instance;
  process: ChildProcess;
  proxyCleanup: (() => void) | null;
}
