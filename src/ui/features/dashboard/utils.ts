import { DASHBOARD_LIMITS, DASHBOARD_WINDOWS } from './constants';

const EMPTY_DISPLAY_VALUE = '-';

export function formatTime(
  value?: string | null,
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
): string {
  if (!value) return EMPTY_DISPLAY_VALUE;
  return new Date(value).toLocaleString(locale);
}

export function minutesSince(value?: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const diffMs = now - new Date(value).getTime();
  if (diffMs < 0) return 0;
  return Math.round(diffMs / 60_000);
}

export function isWithinLastMinutes(
  value?: string | null,
  minutes = DASHBOARD_WINDOWS.recentIssuesMinutes,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const diffMs = now - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

export function summarizeIssueMessage(
  message: string,
  maxLength = DASHBOARD_LIMITS.summaryPreviewLength,
): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function formatMaybeValue(value?: string | null, fallback = EMPTY_DISPLAY_VALUE): string {
  return value && value.trim() ? value : fallback;
}
