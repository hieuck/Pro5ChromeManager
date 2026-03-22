# Tech Stack

## Runtime & Language

- Node.js 18+ (server)
- TypeScript 5 with `strict: true`
- Module system: CommonJS on server (`tsconfig.json` → `"module": "CommonJS"`), ESM on UI (Vite)
- Do NOT add `"type": "module"` to `package.json`

## Backend

- **Express.js** — HTTP server, binds `127.0.0.1:3210` by default
- **ws** — WebSocket server at `ws://localhost:3210/ws`
- **zod** — input validation on all API routes
- **archiver** — profile export to `.zip`
- **uuid** — UUID v4 generation
- **Node.js crypto** — AES-256-GCM encryption for proxy passwords
- **child_process** (built-in) — spawn Chromium processes
- **fs/promises** (built-in) — all file I/O

## Desktop

- **Electron** — wraps Express server + React UI thành desktop app
- **electron-builder** — đóng gói thành Windows NSIS installer (.exe)
- Electron main process khởi động Express server, tạo BrowserWindow trỏ đến `localhost:3210/ui`
- Tray icon hỗ trợ minimize to system tray
- Source: `src/electron/main.ts`, `src/electron/preload.ts`
- tsconfig riêng: `tsconfig.electron.json` → `dist/electron-main/`

## Frontend

- **React 18** + **Vite 5**
- **Ant Design 5** — UI component library (`antd` + `@ant-design/icons`)
- **React Router 6** — client-side routing (`/profiles`, `/settings`, `/logs`)
- Root: `src/ui/`, Vite config at `vite.config.ts`
- Dev server: `http://localhost:5173`
- Production: served by Express at `/ui`

## Testing

- **Vitest** — test runner, config at `vitest.config.ts`
- Test environment: `node`
- Test files: `src/**/*.test.ts`

## Build

- Server: `tsc -p tsconfig.json` → `dist/server/`
- UI: `vite build` → `dist/ui/`
- Extension: `src/extension/` — no build needed, copied directly

## Common Commands

```bash
npm install          # install dependencies
npm run dev:server   # run server in dev mode (ts-node-dev, auto-restart)
npm run dev:ui       # run UI dev server on port 5173
npm run dev:electron # run Electron app in dev mode
npm run build        # build server + UI for production
npm run build:electron # build + package thành Windows installer
npm start            # run compiled server (non-Electron)
npm test             # run tests once (no watch)
npx vitest run       # same as npm test
npx tsc --noEmit     # type check without emitting
```

## Key Conventions

- API responses: `{ success: true, data: T }` or `{ success: false, error: string, details?: unknown }`
- All errors logged with: `console.error(`[${new Date().toISOString()}]`, error)`
- Validate all API input with Zod before processing
- Proxy passwords encrypted AES-256-GCM, key derived from machine ID — never stored plaintext
