import { describe, expect, it } from 'vitest';
import { parseStoredLogLine } from './logParsing';

describe('parseStoredLogLine', () => {
  it('preserves debug level and nested source metadata from JSON logs', () => {
    const entry = parseStoredLogLine(JSON.stringify({
      level: 'debug',
      message: 'WebSocket client connected',
      timestamp: '2026-03-22T23:54:45.858Z',
      meta: {
        source: 'ws-gateway',
      },
    }));

    expect(entry.level).toBe('debug');
    expect(entry.message).toBe('WebSocket client connected');
    expect(entry.timestamp).toBe('2026-03-22T23:54:45.858Z');
    expect(entry.source).toBe('ws-gateway');
  });

  it('falls back to msg field and direct source when message is absent', () => {
    const entry = parseStoredLogLine(JSON.stringify({
      level: 'info',
      msg: 'RuntimeManager initialized',
      timestamp: '2026-03-22T23:54:22.006Z',
      source: 'runtime-manager',
    }));

    expect(entry.level).toBe('info');
    expect(entry.message).toBe('RuntimeManager initialized');
    expect(entry.source).toBe('runtime-manager');
  });

  it('parses legacy plain-text logs and normalizes warning level', () => {
    const entry = parseStoredLogLine('2026-03-22T23:54:22.000Z [warning] Fingerprint defaults fallback engaged');

    expect(entry.timestamp).toBe('2026-03-22T23:54:22.000Z');
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('Fingerprint defaults fallback engaged');
    expect(entry.source).toBeNull();
  });
});
