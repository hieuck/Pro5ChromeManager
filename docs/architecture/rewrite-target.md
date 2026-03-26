# Rewrite Target Architecture

## Why this exists

The repository rewrite was needed because the old codebase mixed multiple structure styles at the same time:

- route-by-type and feature-by-folder on the server
- page wrapper files and page folders in the UI
- generic file names such as `index.tsx`, `utils.ts`, and `types.ts` without enough local context

This document now records the canonical structure that the repository has been migrated to. Future refactors should preserve these boundaries instead of reintroducing legacy layers.

## Repository shape

```text
src/
  electron/
  e2e/
  shared/
    contracts/
    i18n/
  server/
    core/
      http.ts
      browser/
      fs/
      logging/
      network/
      realtime/
      server/
    features/
      <domain>/
        index.ts
        <Domain>Manager.ts
        router.ts
        contracts.ts
        helpers.ts
    templates/
    tests/
  ui/
    api/
    features/
      <domain>/
        index.ts
        <Feature>Page.tsx
        components/
        hooks/
        <feature helper modules>.ts
    shared/
      components/
      hooks/
      utils/
    i18n/
```

## Naming rules

- Use domain or feature names, not technical buckets, whenever possible.
- Shared UI primitives should live in `src/ui/shared/*`; domain-owned UI should live under `src/ui/features/<domain>/*`.
- Shared UI helpers should live in `src/ui/shared/utils/*`; feature-local helpers should stay inside their owning feature module.
- Primary page components must end with `Page.tsx`.
- Thin module entrypoints may be named `index.ts` or `index.tsx` only when they export the canonical page component and approved public API.
- Do not reintroduce duplicate wrapper folders such as `src/ui/pages/*` once `src/ui/features/*` is the canonical home.
- Shared helpers should be named by purpose, not `utils`, unless the folder already gives enough context.
- Feature modules in `src/server/features/<domain>` should expose a clean `index.ts` public entrypoint when the domain is already split across multiple files.
- Application entrypoints should import from `src/ui/features/*` and `src/server/features/*` instead of importing compatibility folders directly.
- `src/server/core/*` owns composition and process lifecycle concerns.
- Cross-runtime contracts belong in `src/shared/contracts/*`; shared language metadata belongs in `src/shared/i18n/*`.
- `src/server/features/*` owns domain runtime services; do not add new tracked files under `src/server/managers/*`.

## Locked decisions

- UI runtime entrypoints live under `src/ui/features/*`.
- Server runtime entrypoints live under `src/server/features/*`.
- Server composition and infrastructure concerns live under `src/server/core/*`.
- Cross-runtime contracts and shared locale metadata live under `src/shared/*`.
- Generic compatibility layers such as `src/ui/pages/*`, `src/ui/utils/*`, `src/server/app/*`, and `src/server/routes/*` must stay removed.

## Verification bar

- Structural changes must keep `npm test` green.
- Structural changes must keep `npm run build` green.
- Structural changes must keep `npm audit --audit-level=high` green.

## Next phase

The architecture rewrite is complete. Remaining work belongs to code-quality refactoring inside the locked structure, not further folder-model migration.
