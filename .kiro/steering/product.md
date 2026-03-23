# Product

Anti-Detect Browser Manager — phần mềm quản lý trình duyệt đa profile, cạnh tranh với GPMLogin và PionLogin.

## Mục đích

Cho phép người dùng tạo và vận hành nhiều profile trình duyệt Chromium độc lập, mỗi profile có:
- Fingerprint riêng biệt (User-Agent, Canvas, WebGL, fonts, timezone, screen, audio)
- Proxy riêng (HTTP/HTTPS/SOCKS4/SOCKS5)
- User data directory riêng biệt, hoàn toàn cô lập

## Use Cases chính

- Quản lý nhiều tài khoản mạng xã hội
- Affiliate marketing, e-commerce đa tài khoản
- Automation qua CDP (Puppeteer, Playwright)

## Pricing Model

- Miễn phí hoàn toàn, không giới hạn profiles, không cần đăng ký

## Kiến trúc tổng thể

```
Web UI (React) → REST API (Express 127.0.0.1:3210) → Core Managers → Chromium processes
```

WebSocket tại `ws://localhost:3210/ws` để push real-time instance status.

## Core Modules

- **ProfileManager** — CRUD profiles, lưu tại `data/profiles/{id}/profile.json`
- **InstanceManager** — spawn/stop Chromium processes, health check, session check
- **FingerprintEngine** — sinh và inject fingerprint qua Chrome extension
- **ProxyManager** — quản lý proxy list, test proxy, encrypt passwords
- **RuntimeManager** — quản lý Chromium executables (Chrome, Edge, CentBrowser, Chromium)
- **ConfigManager** — đọc/ghi `data/config.json`
