import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { dataPath } from '../../core/fs/dataPaths';
import { appendIfExists, buildIncidentSnapshot, loadIncidentEntries, sanitizeJsonText } from './supportDiagnostics';
import { buildSupportSelfTest, buildSupportStatus } from './supportStatus';

export interface DiagnosticsSummary {
  generatedAt: string;
  appVersion: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  dataDir: string;
}

export function buildDiagnosticsSummary(): DiagnosticsSummary {
  return {
    generatedAt: new Date().toISOString(),
    appVersion: process.env['npm_package_version'] ?? '1.0.0',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    dataDir: dataPath(),
  };
}

export async function createDiagnosticsArchive(): Promise<string> {
  const tmpZipPath = path.join(os.tmpdir(), `pro5-diagnostics-${Date.now()}.zip`);
  const supportStatus = await buildSupportStatus();
  const selfTest = await buildSupportSelfTest();
  const incidents = buildIncidentSnapshot(await loadIncidentEntries(50));
  const summary = buildDiagnosticsSummary();

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(tmpZipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });
    archive.append(JSON.stringify(supportStatus, null, 2), { name: 'support-status.json' });
    archive.append(JSON.stringify(selfTest, null, 2), { name: 'self-test.json' });
    archive.append(JSON.stringify(incidents, null, 2), { name: 'incidents.json' });
    archive.append(JSON.stringify(incidents.summary, null, 2), { name: 'incident-summary.json' });
    archive.append(JSON.stringify(incidents.timeline, null, 2), { name: 'incident-timeline.json' });

    void Promise.all([
      appendIfExists(archive, dataPath('config.json'), 'config.json', sanitizeJsonText),
      appendIfExists(archive, dataPath('instances.json'), 'instances.json', sanitizeJsonText),
      appendIfExists(archive, dataPath('proxies.json'), 'proxies.json', sanitizeJsonText),
      appendIfExists(archive, dataPath('activity.log'), 'activity.log'),
      appendIfExists(archive, dataPath('onboarding-state.json'), 'onboarding-state.json', sanitizeJsonText),
      appendIfExists(archive, dataPath('support-feedback.json'), 'support-feedback.json', sanitizeJsonText),
    ]).then(async () => {
      try {
        const logFiles = await fs.readdir(dataPath('logs'));
        for (const file of logFiles.filter((entry) => entry.endsWith('.log'))) {
          archive.file(dataPath('logs', file), { name: path.posix.join('logs', file) });
        }
      } catch {
        // ignore missing logs
      }

      void archive.finalize();
    }).catch(reject);
  });

  return tmpZipPath;
}
