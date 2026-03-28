import { describe, expect, it } from 'vitest';
import { assertWithinBase, sanitizePath } from './pathSanitizer';

describe('path sanitization', () => {
  it('resolves relative paths inside the configured base directory', () => {
    const resolved = sanitizePath('E:/workspace/data', './profiles/demo.json').replaceAll('\\', '/');
    expect(resolved).toBe('E:/workspace/data/profiles/demo.json');
  });

  it('allows the base directory itself', () => {
    const resolved = sanitizePath('E:/workspace/data', '.').replaceAll('\\', '/');
    expect(resolved).toBe('E:/workspace/data');
  });

  it('rejects traversal attempts that escape the base directory', () => {
    expect(() => sanitizePath('E:/workspace/data', '../secrets.txt')).toThrow('Path traversal detected');
    expect(() => assertWithinBase('E:/workspace/data', 'E:/workspace/secrets.txt')).toThrow('Path traversal detected');
  });

  it('accepts absolute paths that stay within the base directory', () => {
    expect(() => assertWithinBase('E:/workspace/data', 'E:/workspace/data/profiles/demo.json')).not.toThrow();
  });
});
