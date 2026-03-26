import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../core/logging/logger';
import { dataPath } from '../../core/fs/dataPaths';

const ACTIVITY_LOG_PATH = dataPath('activity.log');

/**
 * Handles appending session activity to the log file.
 */
export class ActivityLogger {
  async append(profileId: string, startedAt: string, stoppedAt: string): Promise<void> {
    const durationMs = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
    const entry = JSON.stringify({ profileId, startedAt, stoppedAt, durationMs }) + '\n';
    try {
      await fs.mkdir(path.dirname(ACTIVITY_LOG_PATH), { recursive: true });
      await fs.appendFile(ACTIVITY_LOG_PATH, entry, 'utf-8');
    } catch (err) {
      logger.warn('ActivityLogger: failed to write activity log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export const activityLogger = new ActivityLogger();
