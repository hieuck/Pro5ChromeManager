import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../core/logging/logger';
import type { Instance } from '../../../shared/contracts';
import { processManager } from './processManager';
import type { RunningEntry } from './types';

export async function reconcilePersistedInstances(instancesPath: string): Promise<void> {
  try {
    const raw = await fs.readFile(instancesPath, 'utf-8');
    const saved = JSON.parse(raw) as Instance[];
    const reconciled = saved.map((instance) => {
      if (instance.status === 'running' && !processManager.exists(instance.pid)) {
        return { ...instance, status: 'stale' as const };
      }
      return instance;
    });
    await persistInstances(instancesPath, reconciled);
  } catch (error) {
    const isNotFound = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isNotFound) {
      logger.warn('InstanceManager: failed to load instances.json', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function persistInstances(instancesPath: string, instances: Instance[]): Promise<void> {
  await fs.mkdir(path.dirname(instancesPath), { recursive: true });
  await fs.writeFile(instancesPath, JSON.stringify(instances, null, 2), 'utf-8');
}

export async function persistRunningEntries(instancesPath: string, running: Map<string, RunningEntry>): Promise<void> {
  await persistInstances(
    instancesPath,
    Array.from(running.values()).map((entry) => entry.instance),
  );
}
