# Operational Runbooks

## Scope

These runbooks are for the current shipped product topology:

- Windows desktop application (Electron)
- embedded local Node.js API server
- local file-system storage
- local loopback API endpoints

This file intentionally avoids Linux service-management and hosted database procedures.

## Daily Operations

### Morning checklist
1. Verify local app launch path works (`npm run launch:desktop -- --check`).
2. Verify health and readiness endpoints respond (`/health`, `/readyz`).
3. Run smoke checks (`npm run ops:smoke`) for release candidates.
4. Confirm local logs are being written and rotated.
5. Check support diagnostics generation works.

### Release-day checklist
1. Run verification gates (`npm run verify`).
2. Run preflight (`npm run release:preflight`).
3. Build package (`npm run package:electron`).
4. Launch packaged build and re-check `/health` and `/readyz`.
5. Capture diagnostics bundle from the packaged app.

## Incident Response

### Critical (P0) - 15 minute response
1. Acknowledge incident and assign owner.
2. Confirm symptom class (startup, API, profile launch, runtime detection).
3. Gather diagnostics bundle and app version.
4. Stabilize user path (rollback installer or temporary workaround).
5. Communicate current status and next checkpoint.

### High Priority (P1) - 1 hour response
1. Reproduce with same app version and settings.
2. Isolate failing subsystem (runtime, profile, proxy, extension, storage).
3. Ship hotfix or mitigation with verification notes.
4. Record root cause and prevention action.

## Monitoring and Health

### Local health commands
```bash
# Basic health
curl -f http://localhost:3210/health

# Readiness
curl -s http://localhost:3210/readyz

# App metrics
curl -s http://localhost:3210/metrics
```

### Operational targets
- Health endpoint returns 200.
- Readiness returns 200 under normal conditions.
- Error responses include correlation IDs for triage.
- Diagnostics export is available for support cases.

## Backup and Recovery

### Local backup guidance
1. Back up `data/` before major upgrades.
2. Validate backup archive can be opened.
3. Keep at least one known-good rollback copy.

### Recovery steps
1. Close the app.
2. Restore required files under `data/` from backup.
3. Relaunch the app.
4. Verify `/readyz` and critical user workflows.

## Troubleshooting Playbooks

### App does not start
1. Run `npm run launch:desktop -- --check`.
2. Verify build outputs exist (`dist/server`, `dist/ui`, `dist/electron-main`).
3. Check startup logs and last error from support screen.

### API endpoints fail
1. Validate `/health` then `/readyz`.
2. Inspect response `x-correlation-id` and search matching logs.
3. Confirm local data path exists and is writable.

### Profile launch failures
1. Validate runtime availability in settings.
2. Confirm profile data and extension path validity.
3. Retry with proxy disabled to isolate cause.

### Elevated errors or instability
1. Export diagnostics bundle.
2. Review incidents and metrics endpoints.
3. Reproduce with a clean profile and baseline config.

## Security and Access

### Minimum controls
- Keep API bound to loopback by default.
- Do not store signing keys or sensitive tokens in repo.
- Use packaged build signing in release workflows when available.
- Do not expose local diagnostics externally without sanitization.

## Escalation Contacts

- Primary on-call: [Contact Info]
- Secondary on-call: [Contact Info]
- Release owner: [Contact Info]
- Product operations lead: [Contact Info]