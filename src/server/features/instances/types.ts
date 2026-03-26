import type { ChildProcess } from 'child_process';
import type { Instance } from '../../../shared/contracts';

export interface RunningEntry {
  instance: Instance;
  process: ChildProcess;
  proxyCleanup: (() => void) | null;
}
