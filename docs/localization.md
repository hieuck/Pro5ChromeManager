# Localization Decision

This project keeps a simple, code-first localization system on purpose.

## Decision

- Keep translations as TypeScript dictionaries in `src/ui/i18n/`.
- Keep Vietnamese as the default UI language for product users.
- Keep English as a first-class maintained locale for contributors and future expansion.
- Keep `qps-ploc` as a built-in pseudo-locale for UI stress testing and localization QA.
- Add all locale registration in one place: `src/ui/i18n/index.ts`.
- Use shared formatting through `formatMessage()` for strings with variables like `{count}` or `{total}`.

This gives us a low-friction workflow now without pulling in a heavier i18n framework too early.

## Why This Approach

- Easy to review in PRs.
- Type-safe enough for the current app size.
- Fast for contributors to understand.
- No runtime dependency on external translation tooling.
- Good fit for an Electron + Vite desktop product that is still evolving quickly.
- Lets us test overflow, hardcoded strings, and placeholder handling before a real translator joins.

## Source Of Truth

- Locale files live in `src/ui/i18n/`.
- The locale registry lives in `src/ui/i18n/index.ts`.
- `useTranslation()` reads from the registry and exposes `t`, `lang`, and `format`.

## Adding A New Language

1. Add the locale code and metadata to `src/server/shared/locales.ts`.
2. Create a new locale file in `src/ui/i18n/`, for example `ja.ts`.
3. Match the same object shape used by the existing locales.
4. Register the locale in `src/ui/i18n/index.ts`.
5. Run:

```bash
npm test
npx tsc --noEmit
```

## Contributor Rules

- Do not hardcode user-facing strings in components.
- Put new strings in the `profile`, `dashboard`, `proxy`, `settings`, or other relevant namespace.
- Use `format()` for variable interpolation instead of manual `.replace(...)`.
- Prefer stable keys over sentence-like keys.
- When adding a new key, update both `vi` and `en` in the same change.
- Use `qps-ploc` during QA to catch text overflow and missed hardcoded strings before release.

## When To Upgrade Beyond This

Revisit the current approach if any of these become true:

- 4+ actively maintained languages
- professional translation workflow
- pluralization rules beyond simple placeholders
- runtime locale loading or code-splitting requirements
- translation management outside the codebase

Until then, this structure is the project standard.
