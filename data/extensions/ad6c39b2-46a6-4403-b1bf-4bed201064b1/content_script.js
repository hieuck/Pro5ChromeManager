// Fingerprint Injector — generated content script
// world: MAIN — runs in page context
(function() {
  'use strict';

  const _fp = {"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36","platform":"Win32","vendor":"Google Inc.","language":"en-US","languages":["en-US","en"],"hardwareConcurrency":8,"deviceMemory":0.25,"screenWidth":3840,"screenHeight":2160,"colorDepth":24,"timezone":"Asia/Kolkata","canvas":{"noise":0.0002226104403878199,"seed":688861776},"webgl":{"renderer":"ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)","vendor":"Google Inc. (Intel)","noise":0.00033504889062829237},"audio":{"noise":0.00005868508920612976},"fonts":["Lucida Sans Unicode","Microsoft Sans Serif","MS Gothic","Georgia","Trebuchet MS","Comic Sans MS","Verdana","Times New Roman","Arial","Arial Black","Palatino Linotype"],"webrtcPolicy":"disable_non_proxied_udp"};

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

})();