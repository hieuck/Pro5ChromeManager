# Rewrite Target Architecture

## Why this exists

The repository rewrite was needed because the old codebase mixed multiple structure styles at the same time:

- route-by-type and feature-by-folder on the server
- page wrapper files and page folders in the UI
- generic file names such as `index.tsx`, `utils.ts`, and `types.ts` without enough local context

This document defines the target structure for the rewrite so future refactors move toward one architecture instead of introducing more local optimizations.

## Repository shape

```text
src/
  electron/
  e2e/
  shared/
  server/
    core/
      http.ts
      server/
    features/
      <domain>/
        index.ts
        router.ts
        contracts.ts
        helpers.ts
    managers/
    utils/
    tests/
  ui/
    api/
    features/
      <domain>/
        index.ts
        <Feature>Page.tsx
        components/
        hooks/
    shared/
      components/
      hooks/
    i18n/
```

## Naming rules

- Use domain or feature names, not technical buckets, whenever possible.
- Shared UI primitives should live in `src/ui/shared/*`; domain-owned UI should live under `src/ui/features/<domain>/*`.
- Primary page components must end with `Page.tsx`.
- Thin module entrypoints may be named `index.ts` or `index.tsx` only when they export the canonical page component and approved public API.
- Do not keep duplicate wrapper folders such as `src/ui/pages/*` once `src/ui/features/*` is the canonical home.
- Shared helpers should be named by purpose, not `utils`, unless the folder already gives enough context.
- Feature modules in `src/server/features/<domain>` should expose a clean `index.ts` public entrypoint when the domain is already split across multiple files.
- Application entrypoints should import from `src/ui/features/*` and `src/server/features/*` instead of importing legacy folders directly.
- `src/server/core/*` owns composition and process lifecycle concerns.

## Migration rules

- Prefer folder modules over duplicate wrapper files.
- Preserve public imports during migration with thin adapters only when necessary.
- Do not move unrelated domains in the same commit.
- Every structural phase must keep `npm test` and `npm run build` green.

## Current migration priorities

1. Reduce oversized managers by pushing domain-specific behavior closer to `features/*` and focused helpers.
2. Revisit test structure after architecture boundaries are stable.
