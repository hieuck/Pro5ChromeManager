import { describe, expect, it } from 'vitest';
import { buildDiagnosticsSummary } from './supportDiagnosticsExport';

describe('supportDiagnosticsExport', () => {
  it('builds diagnostics summary from runtime metadata', () => {
    const summary = buildDiagnosticsSummary();

    expect(summary.appVersion).toBeTruthy();
    expect(summary.nodeVersion).toBe(process.version);
    expect(summary.platform).toBe(process.platform);
    expect(summary.arch).toBe(process.arch);
    expect(summary.dataDir).toBeTruthy();
    expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
  });
});
