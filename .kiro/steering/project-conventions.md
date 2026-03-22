# Project Conventions

## Project Overview
Anti-Detect Browser Manager - phần mềm quản lý trình duyệt đa profile (cạnh tranh với GPMLogin, PionLogin).
- Backend: Node.js 18+ + Express + TypeScript (CommonJS)
- Frontend: React + Vite + TypeScript
- Data: `data/config.json`, `data/instances.json`, `data/proxies.json`, `data/profiles/{id}/profile.json`

## TypeScript Rules
- Luôn dùng `strict: true`
- Không dùng `any` — dùng `unknown` nếu cần, sau đó narrow type
- Tất cả async function phải có try/catch hoặc được wrap bởi error handler
- Dùng `interface` cho data shapes, `type` cho unions/aliases
- Export named exports, không dùng default export cho managers/utils

## Module System
- Server: CommonJS (`require`/`module.exports` qua TypeScript `import`/`export`)
- UI: ESM (Vite handles it)
- Không dùng `"type": "module"` trong package.json

## Error Handling
- API routes trả về JSON: `{ success: false, error: "message" }` với HTTP status phù hợp
- Managers throw typed errors, routes catch và format response
- Luôn log lỗi với timestamp: `console.error(`[${new Date().toISOString()}]`, error)`

## File & Naming Conventions
- Managers: `PascalCase.ts` (e.g., `ProfileManager.ts`)
- Routes: `camelCase.ts` (e.g., `profiles.ts`)
- Utils: `camelCase.ts` (e.g., `portScanner.ts`)
- Test files: `*.test.ts` cạnh file được test
- Constants: `UPPER_SNAKE_CASE`

## API Response Format
```typescript
// Success
{ success: true, data: T }
// Error  
{ success: false, error: string, details?: unknown }
```

## Security Rules
- API Server chỉ bind `127.0.0.1` theo mặc định
- Validate tất cả input với Zod trước khi xử lý
- Sanitize file paths để ngăn path traversal: dùng `path.resolve` và kiểm tra prefix
- Proxy passwords phải được mã hóa AES-256-GCM, không lưu plaintext
