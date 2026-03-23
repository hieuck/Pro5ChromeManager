export interface ParsedLogEntry {
  timestamp: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  raw: string;
  source: string | null;
}

function normalizeLevel(value: unknown): 'debug' | 'info' | 'warn' | 'error' {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'debug') return 'debug';
  if (normalized === 'error') return 'error';
  if (normalized === 'warn' || normalized === 'warning') return 'warn';
  return 'info';
}

function pickSource(record: Record<string, unknown>): string | null {
  const directKeys = ['source', 'context', 'module', 'component', 'service', 'logger'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const nestedCandidates = [record.meta, record.metadata, record.defaultMeta];
  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const nestedRecord = candidate as Record<string, unknown>;
    for (const key of directKeys) {
      const value = nestedRecord[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

export function parseStoredLogLine(line: string): ParsedLogEntry {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const message =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message
          : typeof parsed.msg === 'string' && parsed.msg.trim()
            ? parsed.msg
            : line;

      return {
        timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : null,
        level: normalizeLevel(parsed.level),
        message,
        raw: line,
        source: pickSource(parsed),
      };
    }
  } catch {
    // Fall back to the legacy plain-text log format used in older builds.
  }

  const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
  if (!match) {
    return {
      timestamp: null,
      level: 'info',
      message: line,
      raw: line,
      source: null,
    };
  }

  const [, timestamp, level, message] = match;
  return {
    timestamp,
    level: normalizeLevel(level),
    message,
    raw: line,
    source: null,
  };
}
