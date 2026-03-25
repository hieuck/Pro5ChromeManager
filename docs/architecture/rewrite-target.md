# Rewrite Target Architecture

## Why this exists

The repository currently mixes multiple structure styles at the same time:

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
    app/
      <domain>/
        contracts.ts
        helpers.ts
        router.ts
      server/
        bootState.ts
        lifecycle.ts
        http/
    managers/
    routes/
    utils/
    tests/
  ui/
    app/
    api/
    components/
    hooks/
    i18n/
    pages/
      <Feature>/
        <Feature>Page.tsx
        index.tsx
        components/
        hooks/
        services/
        state/
        types.ts
```

## Naming rules

- Use domain or feature names, not technical buckets, whenever possible.
- Primary page components must end with `Page.tsx`.
- Thin module entrypoints may be named `index.tsx` only when they export the canonical page component and approved public API.
- Avoid duplicate wrapper files like `src/ui/pages/Logs.tsx` when a feature folder already exists.
- Shared helpers should be named by purpose, not `utils`, unless the folder already gives enough context.
- Route adapters in `src/server/routes` should stay thin and delegate to `src/server/app/<domain>`.
- Route adapter files in `src/server/routes` must end with `.routes.ts`.
- Feature modules in `src/server/app/<domain>` should expose a clean `index.ts` public entrypoint when the domain is already split across multiple files.

## Migration rules

- Prefer folder modules over duplicate wrapper files.
- Preserve public imports during migration with thin adapters only when necessary.
- Do not move unrelated domains in the same commit.
- Every structural phase must keep `npm test` and `npm run build` green.

## Current migration priorities

1. Normalize UI page module structure and naming.
2. Move remaining large server routes into `src/server/app/<domain>`.
3. Replace generic cross-cutting files with domain-specific modules.
4. Revisit test structure after architecture boundaries are stable.
