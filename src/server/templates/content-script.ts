import type { FingerprintConfig } from '../shared/types';

export interface IdentityConfig {
  profileId: string;
  profileName: string;
  subtitle: string;
  accentColor: string;
}

export function buildContentScriptTemplate(fp: FingerprintConfig, identity: IdentityConfig): string {
  const fpJson = JSON.stringify(fp);
  const identityJson = JSON.stringify(identity);

  return `
// Fingerprint Injector — generated content script
// world: MAIN — runs in page context
(function() {
  'use strict';

  const _fp = ${fpJson};
  const _identity = ${identityJson};

  function def(obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, {
        get: function() { return value; },
        configurable: true,
        enumerable: true,
      });
    } catch(e) {}
  }

  // ── navigator overrides ──────────────────────────────────────────────────────
  def(Navigator.prototype, 'userAgent', _fp.userAgent);
  def(Navigator.prototype, 'platform', _fp.platform);
  def(Navigator.prototype, 'vendor', _fp.vendor);
  def(Navigator.prototype, 'language', _fp.language);
  def(Navigator.prototype, 'languages', Object.freeze(_fp.languages));
  def(Navigator.prototype, 'hardwareConcurrency', _fp.hardwareConcurrency);
  def(Navigator.prototype, 'deviceMemory', _fp.deviceMemory);

  // ── screen overrides ─────────────────────────────────────────────────────────
  def(Screen.prototype, 'width', _fp.screenWidth);
  def(Screen.prototype, 'height', _fp.screenHeight);
  def(Screen.prototype, 'availWidth', _fp.screenWidth);
  def(Screen.prototype, 'availHeight', _fp.screenHeight - 40);
  def(Screen.prototype, 'colorDepth', _fp.colorDepth);
  def(Screen.prototype, 'pixelDepth', _fp.colorDepth);

  // ── Canvas noise ─────────────────────────────────────────────────────────────
  const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width || 1, this.height || 1);
      const seed = _fp.canvas.seed;
      const noise = _fp.canvas.noise;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = ((seed * (i + 1)) % 256) / 256;
        imageData.data[i]     = Math.min(255, imageData.data[i]     + Math.floor(r * noise * 255));
        imageData.data[i + 1] = Math.min(255, imageData.data[i + 1] + Math.floor(r * noise * 255));
        imageData.data[i + 2] = Math.min(255, imageData.data[i + 2] + Math.floor(r * noise * 255));
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return _origToDataURL.call(this, type, quality);
  };

  const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const imageData = _origGetImageData.call(this, sx, sy, sw, sh);
    const seed = _fp.canvas.seed;
    const noise = _fp.canvas.noise;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = ((seed * (i + 1)) % 256) / 256;
      imageData.data[i]     = Math.min(255, imageData.data[i]     + Math.floor(r * noise * 255));
      imageData.data[i + 1] = Math.min(255, imageData.data[i + 1] + Math.floor(r * noise * 255));
      imageData.data[i + 2] = Math.min(255, imageData.data[i + 2] + Math.floor(r * noise * 255));
    }
    return imageData;
  };

  // ── WebGL overrides ──────────────────────────────────────────────────────────
  const _origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return _fp.webgl.vendor;    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37446) return _fp.webgl.renderer;  // UNMASKED_RENDERER_WEBGL
    return _origGetParameter.call(this, parameter);
  };

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const _origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return _fp.webgl.vendor;
      if (parameter === 37446) return _fp.webgl.renderer;
      return _origGetParameter2.call(this, parameter);
    };
  }

  // ── AudioContext noise ───────────────────────────────────────────────────────
  const _OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (_OrigAudioContext) {
    const _origCreateOscillator = _OrigAudioContext.prototype.createOscillator;
    _OrigAudioContext.prototype.createOscillator = function() {
      const osc = _origCreateOscillator.call(this);
      const _origConnect = osc.connect.bind(osc);
      osc.connect = function(dest) {
        return _origConnect(dest);
      };
      return osc;
    };
  }

  // ── Timezone override ────────────────────────────────────────────────────────
  const _OrigDateTimeFormat = Intl.DateTimeFormat;
  function PatchedDateTimeFormat(locales, options) {
    if (!options) options = {};
    if (!options.timeZone) options.timeZone = _fp.timezone;
    return new _OrigDateTimeFormat(locales, options);
  }
  PatchedDateTimeFormat.prototype = _OrigDateTimeFormat.prototype;
  PatchedDateTimeFormat.supportedLocalesOf = _OrigDateTimeFormat.supportedLocalesOf;
  try {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      value: PatchedDateTimeFormat,
      configurable: true,
      writable: true,
    });
  } catch(e) {}

  const TITLE_PREFIX = '[' + _identity.profileName + '] ';

  function ensureProfileTitlePrefix() {
    try {
      const currentTitle = document.title || '';
      if (!currentTitle.startsWith(TITLE_PREFIX)) {
        document.title = TITLE_PREFIX + currentTitle;
      }
    } catch(e) {}
  }

  function mountProfileBadge() {
    try {
      if (!document.documentElement) return;
      if (document.getElementById('pro5-profile-identity-badge')) return;

      const root = document.createElement('div');
      root.id = 'pro5-profile-identity-badge';
      root.setAttribute('data-profile-id', _identity.profileId);
      root.innerHTML =
        '<div class="pro5-profile-identity__dot"></div>' +
        '<div class="pro5-profile-identity__body">' +
          '<div class="pro5-profile-identity__name"></div>' +
          '<div class="pro5-profile-identity__meta"></div>' +
        '</div>';

      const style = document.createElement('style');
      style.id = 'pro5-profile-identity-style';
      style.textContent = [
        '#pro5-profile-identity-badge {',
        'position: fixed;',
        'top: 14px;',
        'right: 18px;',
        'z-index: 2147483647;',
        'display: flex;',
        'align-items: center;',
        'gap: 10px;',
        'padding: 9px 12px;',
        'border-radius: 999px;',
        'background: rgba(15, 23, 42, 0.88);',
        'backdrop-filter: blur(10px);',
        'box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);',
        'color: #f8fafc;',
        'font-family: "Segoe UI", Arial, sans-serif;',
        'line-height: 1.15;',
        'pointer-events: none;',
        'max-width: min(52vw, 360px);',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__dot {',
        'width: 12px;',
        'height: 12px;',
        'border-radius: 999px;',
        'flex: 0 0 auto;',
        'background: ' + _identity.accentColor + ';',
        'box-shadow: 0 0 0 3px rgba(255,255,255,0.12);',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__body {',
        'display: flex;',
        'flex-direction: column;',
        'min-width: 0;',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__name {',
        'font-size: 13px;',
        'font-weight: 700;',
        'white-space: nowrap;',
        'overflow: hidden;',
        'text-overflow: ellipsis;',
        '}',
        '#pro5-profile-identity-badge .pro5-profile-identity__meta {',
        'margin-top: 2px;',
        'font-size: 11px;',
        'color: rgba(226, 232, 240, 0.8);',
        'white-space: nowrap;',
        'overflow: hidden;',
        'text-overflow: ellipsis;',
        '}',
        '@media (max-width: 720px) {',
        '#pro5-profile-identity-badge { top: 10px; right: 10px; max-width: calc(100vw - 20px); }',
        '#pro5-profile-identity-badge .pro5-profile-identity__meta { display: none; }',
        '}'
      ].join('');

      root.querySelector('.pro5-profile-identity__name').textContent = _identity.profileName;
      root.querySelector('.pro5-profile-identity__meta').textContent = _identity.subtitle;

      if (!document.getElementById('pro5-profile-identity-style')) {
        document.documentElement.appendChild(style);
      }

      document.documentElement.appendChild(root);
    } catch(e) {}
  }

  function bootIdentityUi() {
    ensureProfileTitlePrefix();
    mountProfileBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootIdentityUi, { once: true });
  } else {
    bootIdentityUi();
  }

  const observer = new MutationObserver(function() {
    ensureProfileTitlePrefix();
    mountProfileBadge();
  });

  try {
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  } catch(e) {}

})();
`.trim();
}
