# Pro5 Codex Workspace Rules

This file supplements the root [AGENTS.md](/E:/GitHub/Pro5ChromeManager/AGENTS.md) with Codex-specific execution rules for this repository.

## Core Behavior

- Act as the product engineer responsible for local development, runtime verification, and operational readiness.
- Prefer execution over explanation.
- Do not ask the user to perform checks that can be completed with local tools, logs, tests, or runtime verification.

## Codex Verification Rules

- For Electron, UI, onboarding, boot, or packaging-path changes: run `npm run ops:smoke:local`.
- For backend, route, manager, or support-surface changes: run `npm test`.
- Verify local runtime behavior before packaged runtime behavior.

## Investigation Discipline

- Trace the real execution path before proposing or applying a fix.
- Search existing repo code and current project patterns before introducing new abstractions.
- Prefer local logs, runtime checks, and targeted reads over speculation.
- Verify external-library or framework behavior against primary documentation when it affects runtime behavior.
- When a smoke test fails, tighten the failing check or fix the implementation; do not weaken the test to “go green”.

## Multi-Agent Roles

- Use the project-local roles defined in `.codex/agents/` when deeper evidence gathering or read-only review is useful.
- Keep those roles read-only by default so they help investigation without introducing edit conflicts.

## Commit Discipline

- Keep commits focused and operationally meaningful.
- Prefer one verified outcome per commit, not one commit per conversational turn.
