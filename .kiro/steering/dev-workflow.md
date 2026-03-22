# Dev Workflow

## Commands

```bash
# Cài dependencies (chạy 1 lần sau khi clone)
npm install

# Chạy server (development)
npm run dev:server

# Chạy UI (development) - cổng 5173
npm run dev:ui

# Build production
npm run build

# Chạy tests (single run, không watch)
npm test
# hoặc
npx vitest run

# Type check (không emit)
npx tsc --noEmit
```

## Development Flow

1. Server chạy tại `http://127.0.0.1:3210`
2. Web UI chạy tại `http://localhost:5173` (dev) hoặc được serve bởi server tại `/ui` (production)
3. WebSocket tại `ws://localhost:3210/ws`

## Testing Guidelines

- Chạy `npx vitest run` để test một lần (không dùng watch mode)
- Test files đặt cạnh source file: `ProfileManager.test.ts` cạnh `ProfileManager.ts`
- Mỗi manager cần có test file riêng
- Integration tests đặt tại `src/server/tests/`

## npm install

Sau khi cập nhật package.json, luôn chạy `npm install` để sync node_modules.
Nếu gặp lỗi module not found khi chạy, kiểm tra node_modules đã được install chưa.

## Build Output

- Server compiled: `dist/server/`
- UI built: `dist/ui/`
- Extension files: `src/extension/` (không cần build, copy trực tiếp)
- Electron main: `dist/electron-main/`
- Desktop installer: `dist/electron/` (Windows NSIS .exe)

## Data Files

- `data/config.json` — cấu hình app (tự tạo nếu không có)
- `data/instances.json` — trạng thái instances (tự tạo nếu không có)
- `data/proxies.json` — danh sách proxy (tự tạo nếu không có)
- `data/profiles/` — thư mục chứa profile data
