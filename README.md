# Pro5 Chrome Manager

Phần mềm quản lý trình duyệt đa profile cho Windows — mỗi profile có fingerprint riêng biệt, proxy riêng, và user data hoàn toàn cô lập. Cạnh tranh trực tiếp với GPMLogin và PionLogin.

## Tính năng

- Tạo và quản lý nhiều profile Chromium độc lập
- Fingerprint riêng: User-Agent, Canvas, WebGL, Audio, Fonts, Timezone, Screen
- Proxy per-profile: HTTP/HTTPS/SOCKS4/SOCKS5 (có auth)
- Automation qua CDP (Puppeteer, Playwright)
- Real-time status qua WebSocket
- Backup tự động mỗi 24h, giữ 7 bản
- Free tier: 10 profiles — không cần đăng ký
- Paid: $29 lifetime — không giới hạn profiles

## Yêu cầu

- Windows 10/11 (64-bit)
- Node.js 18+ (để chạy dev mode)
- Chrome, Edge, CentBrowser, hoặc Chromium đã cài sẵn

## Cài đặt nhanh (Desktop App)

Tải installer `.exe` mới nhất từ [GitHub Releases](https://github.com/hieuck/Pro5ChromeManager/releases).

> Nếu Windows SmartScreen hiện cảnh báo: bấm **More info** → **Run anyway**. Đây là do installer chưa có code signing certificate.

## Chạy từ source

```bash
# 1. Clone và cài dependencies
git clone https://github.com/hieuck/Pro5ChromeManager
cd Pro5ChromeManager
npm install

# 2. Chạy development mode
npm run dev:server   # Backend → http://127.0.0.1:3210
npm run dev:ui       # UI     → http://localhost:5173

# Hoặc chạy Electron app trực tiếp
npm run dev:electron
```

## Build & Đóng gói

```bash
# Build server + UI + Electron main
npm run build

# Tạo Windows installer (.exe) — output: dist/electron/
npm run package:electron
```

## Release

```bash
# Bump version trong package.json, sau đó:
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions tự build installer và upload lên Releases
```

## Test

```bash
npm test
# hoặc
npx vitest run      # 86 tests, ~2s
npx tsc --noEmit    # type check
```

## Automation qua CDP

Kết nối Puppeteer/Playwright vào profile đang chạy:

```typescript
// 1. Start profile
const res = await fetch('http://localhost:3210/api/profiles/{profileId}/start', { method: 'POST' });
const { data } = await res.json();
// data.remoteDebuggingPort = cổng CDP

// 2. Connect Playwright
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(`http://localhost:${data.remoteDebuggingPort}`);
const [page] = browser.contexts()[0].pages();
await page.goto('https://example.com');
```

## Cấu trúc thư mục

```
src/server/      # Backend Node.js + Express (CommonJS)
src/ui/          # Frontend React + Vite (ESM)
src/electron/    # Electron main process
src/extension/   # Chrome extension — fingerprint injection
data/            # Runtime data (tự tạo khi chạy lần đầu)
  config.json    # App config
  profiles/      # Profile data + Chromium user data
  proxies.json   # Proxy list (passwords encrypted AES-256-GCM)
  backups/       # Auto backups (7 bản gần nhất)
  logs/          # App logs (daily rotate)
resources/       # Electron app icons
scripts/         # Build utilities
```

## API

Server bind `127.0.0.1:3210`. Một số endpoints chính:

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Server health + uptime |
| GET | `/api/profiles` | Danh sách profiles |
| POST | `/api/profiles` | Tạo profile mới |
| POST | `/api/profiles/:id/start` | Mở profile (trả về CDP port) |
| POST | `/api/profiles/:id/stop` | Đóng profile |
| POST | `/api/profiles/:id/session-check` | Kiểm tra trạng thái đăng nhập |
| GET | `/api/proxies` | Danh sách proxy |
| POST | `/api/proxies/:id/test` | Test proxy (trả về IP) |
| GET | `/api/license/status` | Trạng thái license |
| POST | `/api/license/activate` | Kích hoạt license key |

WebSocket: `ws://localhost:3210/ws` — nhận events `instance:started`, `instance:stopped`, `instance:status-changed`.

## License

MIT — xem [LICENSE](LICENSE)
