export function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

export function minutesSince(value?: string | null): number | null {
  if (!value) return null;
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 0) return 0;
  return Math.round(diffMs / 60_000);
}

export function isWithinLastMinutes(value?: string | null, minutes = 60): boolean {
  if (!value) return false;
  const diffMs = Date.now() - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

export function summarizeIssueMessage(message: string, maxLength = 44): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function formatMaybeValue(value?: string | null, fallback = 'None') {
  return value && value.trim() ? value : fallback;
}
