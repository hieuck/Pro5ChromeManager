import { describe, expect, it } from 'vitest';
import { validateBrowserCoreManifest } from './manifest';

describe('validateBrowserCoreManifest', () => {
  it('accepts valid relative executable paths', () => {
    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: 'chrome-win/chrome.exe',
    })).not.toThrow();
  });

  it('rejects manifests with missing required fields', () => {
    expect(() => validateBrowserCoreManifest({
      key: '',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: 'chrome.exe',
    })).toThrow('Invalid browser core package: missing key');

    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: '  ',
      version: '1.0.0',
      executableRelativePath: 'chrome.exe',
    })).toThrow('Invalid browser core package: missing label');

    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '',
      executableRelativePath: 'chrome.exe',
    })).toThrow('Invalid browser core package: missing version');

    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: '',
    })).toThrow('Invalid browser core package: missing executableRelativePath');
  });

  it('rejects absolute and path-traversing executable paths', () => {
    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: '/absolute/chrome.exe',
    })).toThrow('Invalid browser core package: executableRelativePath must be relative');

    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: '../chrome.exe',
    })).toThrow('Invalid browser core package: executableRelativePath must not traverse parent directories');

    expect(() => validateBrowserCoreManifest({
      key: 'chromium',
      label: 'Chromium',
      version: '1.0.0',
      executableRelativePath: `bin${require('path').sep}..${require('path').sep}..${require('path').sep}chrome.exe`,
    })).toThrow('Invalid browser core package: executableRelativePath must not traverse parent directories');
  });
});
