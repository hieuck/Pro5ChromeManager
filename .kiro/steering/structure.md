# Project Structure

```
/
├── src/
│   ├── server/                   # Backend (compiled to dist/server/)
│   │   ├── index.ts              # Express app entry point
│   │   ├── managers/             # Core business logic (PascalCase.ts)
│   │   │   ├── ConfigManager.ts
│   │   │   ├── ProfileManager.ts
│   │   │   ├── InstanceManager.ts
│   │   │   ├── FingerprintEngine.ts
│   │   │   ├── ProxyManager.ts
│   │   │   └── RuntimeManager.ts
│   │   ├── routes/               # Express route handlers (camelCase.ts)
│   │   │   ├── config.ts
│   │   │   ├── profiles.ts
│   │   │   ├── instances.ts
│   │   │   ├── proxies.ts
│   │   │   └── runtimes.ts
│   │   └── utils/                # Shared utilities (camelCase.ts)
│   │       ├── crypto.ts         # AES-256-GCM helpers
│   │       ├── portScanner.ts    # Find free port (40000–49999)
│   │       └── cdpWaiter.ts      # Poll CDP endpoint until ready
│   ├── extension/                # Chrome extension (no build step)
│   │   ├── manifest.json         # MV3 manifest
│   │   └── content_script.js     # Fingerprint injection (runs at document_start)
│   └── ui/                       # Frontend (built to dist/ui/)
│       ├── index.html
│       ├── main.tsx
│       ├── pages/
│       │   ├── ProfileList.tsx
│       │   └── Settings.tsx
│       └── components/
│           ├── ProfileForm.tsx
│           ├── FingerprintEditor.tsx
│           └── ProxySelector.tsx
├── src/electron/                 # Electron main process (compiled to dist/electron-main/)
│   ├── main.ts                   # Main process: start Express, create BrowserWindow, tray
│   └── preload.ts                # Preload script
├── data/                         # Runtime data (not committed)
│   ├── config.json               # App config (auto-created with defaults)
│   ├── instances.json            # Running instance state
│   ├── proxies.json              # Proxy list (passwords encrypted)
│   └── profiles/
│       └── {profileId}/
│           ├── profile.json      # Profile metadata + fingerprint + proxy config
│           └── Default/          # Chromium user data directory
├── dist/                         # Build output (gitignored)
│   ├── server/
│   ├── ui/
│   ├── electron-main/            # Compiled Electron main process
│   └── electron/                 # Packaged installer output
├── package.json
├── tsconfig.json                 # Server-only (rootDir: src/server)
├── tsconfig.electron.json        # Electron main process
├── vite.config.ts                # UI build (root: src/ui)
├── vitest.config.ts
└── electron-builder.yml          # Desktop packaging config
```

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Managers | `PascalCase.ts` | `ProfileManager.ts` |
| Routes | `camelCase.ts` | `profiles.ts` |
| Utils | `camelCase.ts` | `portScanner.ts` |
| Test files | `*.test.ts` next to source | `ProfileManager.test.ts` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_PORT` |

## Key Patterns

- Managers are singletons exported as named exports, instantiated in `index.ts`
- Routes import manager instances and call their methods; all errors caught and returned as `{ success: false, error }`
- Test files sit next to the file they test; integration tests go in `src/server/tests/`
- `data/` files are auto-created on first run if missing — never assume they exist
