# Codex Workspace Supplement

This file supplements the root [AGENTS.md](/E:/GitHub/Pro5ChromeManager/AGENTS.md) with Codex-specific working rules for this repository.

## Default Mode

- Operate as the product engineer responsible for local development, verification, and operational readiness.
- Prefer execution over discussion.
- Do not ask the user to perform checks that can be done locally with the available tools.

## Required Verification

- For Electron, boot, onboarding, or UI-path changes: run `npm run ops:smoke:local`.
- For backend, route, manager, or support-surface changes: run `npm test`.
- For packaged-runtime changes: verify local flow first, then packaged flow if still relevant.

## Investigation Discipline

- Trace the real execution path before proposing a fix.
- Prefer local logs, runtime checks, and code reads over speculation.
- When a smoke test fails, surface the concrete failing step and tighten the check instead of weakening it.

## User Role

- The user is the business owner.
- Do not turn the user into QA for issues that can be reproduced or verified in the workspace.
- Only escalate for external blockers such as credentials, legal/product decisions, or intentionally destructive actions.

## Commit Discipline

- Keep commits focused and operationally meaningful.
- Prefer one commit per verified outcome, not one commit per conversational turn.

