# Operations Runbook

## Release Preflight

Run these checks before creating a public release:

```bash
npm test
npm run build
npm run release:preflight
npm run ops:smoke
npm run package:electron
npm run ops:artifacts:verify
```

Verify the following manually:

- `PRO5_OFFLINE_SECRET` is configured for production builds.
- `CSC_LINK` and `CSC_KEY_PASSWORD` are configured if you want signed Windows installers.
- GitHub Pages reflects the latest `landing/` content on `main`.
- The app can export diagnostics from `Settings -> Export Diagnostics`.
- `Settings -> Support` shows expected app version, data dir, and no blocking warnings.

## Packaging

Use:

```bash
npm run release:preflight
npm run ops:smoke
npm run package:electron
npm run ops:artifacts:verify
```

Artifacts are emitted to `dist/electron/`.

After packaging, verify:

- `dist/electron/RELEASE_MANIFEST.json`
- `dist/electron/SHA256SUMS.txt`

These files provide a release inventory and SHA-256 checksums for every packaged artifact.
`npm run ops:artifacts:verify` re-checks that the manifest and checksums still match the packaged files before upload.

## Incident Triage

When a user reports a problem:

1. Ask them to open `Settings -> Support`.
2. Ask them to export diagnostics from `Settings -> Export Diagnostics`.
3. Review:
   - app version
   - `support-status.json`, `self-test.json`, and `incidents.json` from the diagnostics bundle
   - runtime in use
   - diagnostics bundle
   - recent logs
   - `logs/electron-main.log` for Electron window/update/renderer incidents
   - `logs/exceptions-YYYY-MM-DD.log` and `logs/rejections-YYYY-MM-DD.log` for fatal server events
4. Reproduce locally with the same runtime or proxy mode.
5. If UI does not open, verify `GET /readyz` and compare it with `electron-main.log` startup entries.

## Health / Readiness

- `GET /health`: liveness check for the API process.
- `GET /readyz`: readiness check for bootstrap state, runtime availability, license tier, and core manager counts.
- `POST /api/support/self-test`: support-facing environment self-test for runtime, profiles dir, diagnostics, support pages, and license state.
- Local smoke validation: `npm run ops:smoke`

## Landing / Support Surface

Public support/legal pages live in:

- `landing/index.html`
- `landing/support.html`
- `landing/privacy.html`
- `landing/terms.html`

Issue intake is controlled through:

- `.github/ISSUE_TEMPLATE/support.yml`
- `.github/ISSUE_TEMPLATE/config.yml`

## Known Operational Warnings

- If code signing is not configured, Windows SmartScreen warnings are expected.
- If `PRO5_OFFLINE_SECRET` is missing in production, offline licenses are intentionally disabled.
- The UI bundle is currently large because of `antd`; this affects cold-start performance more than correctness.
