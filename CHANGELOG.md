# Changelog

All notable changes to Pro5 Chrome Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-22

### Added
- ProfileManager — CRUD profiles, migration v0→v1, import/export ZIP
- FingerprintEngine — generate fingerprint, prepareExtension, DB version check
- ProxyManager — CRUD, AES-256-GCM password encryption, testProxy, buildProxyConfig
- RuntimeManager — load, checkAvailability, resolveRuntime
- InstanceManager — launch/stop Chromium, CDP health check, sessionCheck, activity log
- ConfigManager — read/write data/config.json with Zod validation and migration
- BackupManager — auto-backup every 24h, 7-backup rotation, PowerShell restore
- LicenseManager — hybrid online/offline validation, HMAC-SHA256 offline keys, grace period
- WebSocket server — real-time instance status broadcast
- REST API — full CRUD for profiles, proxies, runtimes, config, backups, license
- React UI — ProfileList with search/filter/bulk actions, ProfileForm drawer (4 tabs)
- Settings page — General, Runtimes, Backup, Logs tabs
- WelcomeScreen — onboarding flow for first-time users
- Keyboard shortcuts — Ctrl+N, Ctrl+F, arrow keys, Enter, Escape, ? help modal
- Electron desktop app — BrowserWindow, system tray, auto-updater
- Chrome extension (MV3) — fingerprint injection at document_start
- CI/CD — GitHub Actions: test on push, build installer on tag v*.*.*
- Free tier: 10 profiles without registration
- Paid tier: $29 lifetime via LemonSqueezy

### Security
- API server binds 127.0.0.1 only
- All inputs validated with Zod
- Proxy passwords encrypted AES-256-GCM, key derived from machine ID
- Path traversal protection via pathSanitizer
