import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from './urlSafety';

describe('isSafeExternalUrl', () => {
  it('allows http and https URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('blocks non-http(s) protocols', () => {
    expect(isSafeExternalUrl('file:///tmp/test')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('mailto:support@example.com')).toBe(true);
    expect(isSafeExternalUrl('tel:+123456')).toBe(false);
  });

  it('blocks malformed URLs', () => {
    expect(isSafeExternalUrl('not-a-url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});
