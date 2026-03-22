# Design Document

## Overview

Anti-Detect Browser Manager là một ứng dụng desktop/server hybrid gồm:
- **Backend**: Node.js HTTP server (API_Server) cung cấp REST API
- **Frontend**: Web UI (React hoặc vanilla JS) chạy local, giao tiếp với API_Server
- **Core Engine**: Các module quản lý Profile, Instance, Fingerprint, Proxy, Runtime

Kiến trúc tổng thể theo mô hình client-server local: Web UI → REST API → Core Modules → Chromium processes.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Web UI (Browser)                  │
│              http://localhost:3210/ui                │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP REST / WebSocket
┌──────────────────────▼──────────────────────────────┐
│                   API Server (Express)               │
│                   127.0.0.1:3210                     │
├─────────────────────────────────────────────────────┤
│  ProfileManager │ InstanceManager │ FingerprintEngine│
│  ProxyManager   │ RuntimeManager  │ ConfigManager    │
├─────────────────────────────────────────────────────┤
│              data/config.json                        │
│              data/instances.json                     │
│              data/profiles/{profileId}/              │
│                ├── profile.json  (metadata)          │
│                └── Default/      (Chromium user data)│
└──────────────────────┬──────────────────────────────┘
                       │ spawn + CDP
┌──────────────────────▼──────────────────────────────┐
│         Chromium Instances (child processes)         │
│   chrome.exe --user-data-dir=... --remote-debugging-port=...│
└─────────────────────────────────────────────────────┘
```

---

## Components

### 1. ConfigManager

Chịu trách nhiệm đọc, validate, và ghi `data/config.json`.

```typescript
interface AppConfig {
  configVersion: number;          // schema version for migration (current = 1)
  uiLanguage: 'vi' | 'en';
  locale: string;
  timezoneId: string;
  defaultRuntime: string;
  headless: boolean;
  windowTitleSuffixEnabled: boolean;
  onboardingCompleted: boolean;   // false until user completes or skips onboarding
  profilesDir: string;
  api: { host: string; port: number };
  sessionCheck: { enabledByDefault: boolean; headless: boolean; timeoutMs: number };
  runtimes: Record<string, { label: string; executablePath: string }>;
}
```

- Đọc config khi khởi động, tạo file mặc định nếu không tồn tại
- Validate schema với Zod hoặc tương đương
- Expose endpoint `GET /api/config` và `PUT /api/config`

### 2. ProfileManager

Quản lý CRUD cho Profile. Mỗi Profile được lưu tại `{profilesDir}/{profileId}/profile.json`.

```typescript
interface Profile {
  id: string;           // UUID v4
  schemaVersion: number; // current = 1; used for migration
  name: string;
  notes: string;
  tags: string[];
  group: string | null;
  owner: string | null;  // team collaboration: who manages this profile
  runtime: string;      // key trong config.runtimes hoặc "auto"
  proxy: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  createdAt: string;    // ISO 8601
  updatedAt: string;
  lastUsedAt: string | null;
  totalSessions: number; // incremented on each session stop
}
```

- Scan `profilesDir` để load tất cả profiles khi khởi động
- Cache in-memory, sync xuống disk khi có thay đổi
- Hỗ trợ import từ thư mục có sẵn (detect `Default/` folder)
- Export thành `.zip` dùng `archiver`

### 3. FingerprintEngine

Sinh và inject Fingerprint cho mỗi Profile.

```typescript
interface FingerprintConfig {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  canvas: { noise: number; seed: number };
  webgl: { renderer: string; vendor: string; noise: number };
  audio: { noise: number };
  fonts: string[];
  webrtcPolicy: 'default' | 'disable_non_proxied_udp' | 'proxy_only';
}
```

**Injection mechanism**: Chrome extension (content script + background) được inject vào mỗi Instance qua `--load-extension` flag. Extension override các API sau:
- `navigator.userAgent`, `navigator.platform`, `navigator.hardwareConcurrency`, v.v.
- `HTMLCanvasElement.prototype.toDataURL`, `CanvasRenderingContext2D.prototype.getImageData`
- `WebGLRenderingContext.prototype.getParameter`
- `AudioContext` constructor
- `Intl.DateTimeFormat`, `Date` timezone

**MAIN world injection**: Manifest V3 content scripts chạy trong isolated world theo mặc định — không thể override `window.navigator` của page. Extension phải dùng `"world": "MAIN"` trong content script declaration (Chrome 111+) để inject trực tiếp vào page context. Fallback: inject `<script>` tag vào DOM cho Chrome < 111.

**Per-profile extension dirs**: Mỗi profile có extension riêng tại `{appDataDir}/extensions/{profileId}/` chứa `manifest.json` và `content_script.js` được generate với fingerprint config cụ thể. Khi profile bị xóa, extension dir phải được cleanup.

**Fingerprint DB update**: Server check version tại `https://raw.githubusercontent.com/hieuck/Pro5ChromeManager/main/fingerprint-db-version.json` khi khởi động. URL configurable qua env var `FINGERPRINT_DB_REPO_URL`. Skip silently nếu offline.

**Fingerprint generation**: Dùng database UA strings thực tế từ `data/fingerprint-db.json`, sinh giá trị nhất quán theo OS.

### 4. ProxyManager

```typescript
interface ProxyConfig {
  id: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string; // stored encrypted with AES-256-GCM, key derived from machine ID
}
```

- Lưu danh sách proxy tại `data/proxies.json` (passwords encrypted)
- Test proxy bằng cách gửi request đến `https://api.ipify.org` qua proxy
- Tự động detect timezone từ IP của proxy qua `https://ipapi.co/{ip}/timezone`

**SOCKS5 auth limitation**: Chromium không hỗ trợ proxy authentication cho SOCKS5 qua `--proxy-server` flag. Giải pháp: dùng thư viện `proxy-chain` để tạo local proxy forwarder (127.0.0.1:random_port) có auth, rồi truyền local port đó vào Chrome flag. HTTP/HTTPS proxy auth được handle qua CDP `Network.authenticate` event.

### 5. InstanceManager

Quản lý vòng đời của Chromium processes.

```typescript
interface Instance {
  profileId: string;
  profileName: string;
  runtime: string;
  pid: number;
  remoteDebuggingPort: number;
  userDataDir: string;
  launchMode: 'native' | 'headless';
  status: 'running' | 'stopped' | 'unreachable' | 'stale';
  startedAt: string;
  lastHealthCheckAt: string | null;
}
```

**Port allocation**: Scan ports từ 40000 đến 49999, chọn port chưa được sử dụng.

**Launch flow**:
1. Resolve runtime executable path
2. Build Chrome flags (--user-data-dir, --remote-debugging-port, --load-extension, --proxy-server, v.v.)
3. Spawn process với `child_process.spawn`
4. Đợi CDP endpoint sẵn sàng (poll `http://localhost:{port}/json/version`)
5. Inject fingerprint extension nếu chưa được load
6. Lưu instance vào `instances.json` và in-memory map

**Health check**: Setinterval mỗi 30s, gọi `http://localhost:{port}/json/version`. Nếu timeout → status = `unreachable`.

**Session check**: Mở headless instance, navigate đến URL, chạy JS để detect login state, đóng instance.

### 6. LicenseManager

Quản lý free tier và license key validation theo mô hình **Hybrid**: activate 1 lần qua server, cache offline 30 ngày.

```typescript
interface LicenseState {
  tier: 'free' | 'pro';
  key: string | null;
  activatedAt: string | null;     // ISO 8601 — thời điểm activate thành công
  expiresAt: string | null;       // ISO 8601 — null = lifetime license
  machineId: string;              // machine ID tại thời điểm activate
  lastVerifiedAt: string | null;  // ISO 8601 — lần cuối verify với server
  gracePeriodStart: string | null; // set khi server không reach được hoặc machine thay đổi
}
```

**Activation flow**:
1. User nhập license key (format: `XXXX-XXXX-XXXX-XXXX`)
2. App gọi `POST /api/license/activate` → server gọi activation server với `{ key, machineId }`
3. Activation server trả về `{ valid: true, tier, expiresAt }` hoặc `{ valid: false, reason }`
4. Nếu valid: lưu `LicenseState` AES-encrypted vào `data/license.dat`
5. Nếu server không reach: trả về lỗi "Cần kết nối internet để kích hoạt lần đầu"

**Offline cache**: Sau khi activate, app không cần gọi server mỗi lần. Mỗi 30 ngày, app re-verify với server 1 lần (background, silent). Nếu re-verify thất bại (offline), cho phép dùng tiếp trong **grace period 7 ngày** kể từ `lastVerifiedAt + 30 ngày`.

**Machine binding**: Activation server bind key với machineId. Nếu `license.dat` tồn tại nhưng `machineId` không khớp (user clone máy hoặc thay phần cứng), grace period 7 ngày để user liên hệ support.

**Activation server**: Dùng **LemonSqueezy License API** — không tự build, không maintain. LemonSqueezy cung cấp sẵn: tạo key, validate key, bind machineId, revoke key, dashboard quản lý. Free đến khi có doanh thu (5% fee). URL: `https://api.lemonsqueezy.com/v1/licenses/validate`. App gọi API này khi activate và re-verify. `LEMONSQUEEZY_STORE_ID` cấu hình qua env var.

**Storage**: `data/license.dat` — AES-256-GCM encrypted, key derived từ machine ID.

**Free tier limit**: 10 profiles. `createProfile()` trong ProfileManager gọi `LicenseManager.canCreateProfile()` trước khi tạo.

**Free tier limit**: 10 profiles. `createProfile()` trong ProfileManager gọi `LicenseManager.canCreateProfile()` trước khi tạo.

### 7. RuntimeManager

```typescript
interface Runtime {
  key: string;
  label: string;
  executablePath: string;
  available: boolean;
  version?: string;
}
```

- Kiểm tra file tồn tại với `fs.access`
- Đọc version từ `--version` flag của executable
- Auto-select: ưu tiên theo thứ tự `centbrowser > chrome > chromium > msedge`

### 8. API Server

Express.js server với các routes:

```
GET    /health
GET    /api/logs

GET    /api/config
PUT    /api/config

GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/:id
PUT    /api/profiles/:id
DELETE /api/profiles/:id
POST   /api/profiles/:id/start
POST   /api/profiles/:id/stop
GET    /api/profiles/:id/status
POST   /api/profiles/:id/session-check
GET    /api/profiles/:id/export
GET    /api/profiles/:id/activity
POST   /api/profiles/import
POST   /api/profiles/import-bulk

GET    /api/instances
POST   /api/instances/stop-all

GET    /api/proxies
POST   /api/proxies
PUT    /api/proxies/:id
DELETE /api/proxies/:id
POST   /api/proxies/:id/test

GET    /api/runtimes
POST   /api/runtimes
PUT    /api/runtimes/:key
DELETE /api/runtimes/:key

GET    /api/license/status
POST   /api/license/activate
POST   /api/license/deactivate

GET    /api/backups
POST   /api/backups/restore/:timestamp
GET    /api/backups/export
```

WebSocket endpoint `ws://localhost:3210/ws` để push real-time instance status updates.

### 9. Web UI

Single-page application phục vụ tại `http://localhost:3210/ui`. Dùng **Ant Design 5** làm component library, **React Router 6** cho routing.

**Routes**: `/profiles` (default), `/settings`, `/logs`

**App Layout**: Ant Design `Layout` với Sider navigation, Header hiển thị license badge + language toggle, Content area render route hiện tại.

**Trang chính (Profile List)**:
- Bảng/lưới hiển thị profiles với columns: checkbox, tên, status badge, proxy, runtime, tags, ngày tạo, actions
- Toolbar: search, filter by group/tag/status, sort, bulk actions
- Nút "New Profile" mở modal/drawer

**Profile Form**:
- Tab "General": tên, ghi chú, group, tags, runtime
- Tab "Proxy": chọn proxy từ danh sách hoặc nhập mới
- Tab "Fingerprint": hiển thị fingerprint hiện tại, nút "Randomize", chỉnh sửa thủ công từng field

**Settings Page**:
- Cấu hình profilesDir, API host/port, runtimes, session check, UI language

---

## Data Flow

### Khởi động Profile

```
User clicks "Start" 
  → POST /api/profiles/:id/start
  → InstanceManager.launch(profileId)
    → ProfileManager.getProfile(profileId)
    → ProxyManager.buildProxyFlag(profile.proxy)
    → FingerprintEngine.prepareExtension(profile.fingerprint)
    → RuntimeManager.resolveExecutable(profile.runtime)
    → spawn(executable, chromeFlags)
    → waitForCDP(port)
    → save to instances.json
  → return { pid, remoteDebuggingPort, status: 'running' }
  → WebSocket broadcast: { type: 'instance:started', profileId }
  → UI updates status badge to green
```

### Fingerprint Injection

```
FingerprintEngine.prepareExtension(fingerprintConfig)
  → generate extension manifest.json + content_script.js
  → write to temp dir: {appDataDir}/extensions/{profileId}/
  → content_script.js overrides browser APIs using Object.defineProperty
  → extension loaded via --load-extension={extensionDir}
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 18+ |
| HTTP framework | Express.js |
| WebSocket | ws |
| Process management | child_process (built-in) |
| File operations | fs/promises (built-in) |
| Archive/Export | archiver |
| Schema validation | zod |
| Encryption | Node.js crypto (AES-256-GCM) |
| Frontend | React + Vite |
| UI components | Ant Design 5 |
| Build tool | Vite |
| Desktop packaging | Electron + electron-builder |
| Package manager | npm |

## Desktop App (Electron)

Phần mềm được đóng gói thành desktop app chạy trên Windows (macOS/Linux tùy chọn) bằng Electron.

### Kiến trúc Electron

```
Electron Main Process
  ├── Khởi động Express server (src/server/index.ts) trong main process
  ├── Tạo BrowserWindow trỏ đến http://localhost:3210/ui
  ├── Tray icon để minimize to system tray
  └── Auto-start server khi app mở, shutdown khi app đóng

Electron Renderer Process
  └── Web UI (React) — chạy trong BrowserWindow
```

**userData path**: Khi đóng gói Electron, relative paths như `./data/` sẽ resolve sai (relative to `app.asar`). Tất cả data paths phải dùng `app.getPath('userData')` làm base directory. Server phải nhận `dataDir` làm config parameter thay vì hardcode.

**Schema migration**: Khi `profile.json` schema thay đổi giữa các versions, profiles cũ sẽ fail Zod validation. Mỗi `profile.json` lưu field `schemaVersion: number`. Khi load, nếu version cũ hơn current, chạy migration function tương ứng trước khi validate.

### Lý do dùng Electron
- Code Node.js backend tích hợp trực tiếp vào main process, không cần thay đổi
- User click đúp `.exe` để mở, không cần terminal hay Node.js cài sẵn
- Tương tự cách GPMLogin và các anti-detect browser khác đóng gói

### File Structure bổ sung

```
src/
  electron/
    main.ts         # Electron main process: tạo window, start server, tray
    preload.ts      # Preload script (nếu cần IPC)
electron-builder.yml  # Build config: target Windows NSIS installer
```

### Build & Distribution

- Dev: `npm run dev:electron` — chạy Electron với hot reload
- Build: `npm run build:electron` — tạo installer `.exe` (NSIS) cho Windows
- Output: `dist/electron/` chứa installer và unpacked app

---

## Correctness Properties

### P1: Profile UUID Uniqueness (Invariant)
Với bất kỳ tập hợp N profiles nào được tạo, tất cả `profile.id` phải là duy nhất.
```
∀ p1, p2 ∈ profiles: p1 ≠ p2 → p1.id ≠ p2.id
```

### P2: Profile Metadata Round-Trip (Round-Trip)
Ghi metadata Profile xuống disk rồi đọc lại phải cho kết quả tương đương.
```
readProfile(writeProfile(profile)) ≡ profile
```

### P3: Fingerprint Consistency (Invariant)
Fingerprint được sinh ngẫu nhiên phải nhất quán nội bộ: `userAgent` platform phải khớp `platform` field, `screenWidth >= screenHeight` không bắt buộc nhưng resolution phải nằm trong danh sách hợp lệ.
```
∀ fp = generateFingerprint(): 
  extractPlatform(fp.userAgent) == fp.platform
  fp.hardwareConcurrency ∈ [1, 2, 4, 6, 8, 10, 12, 16, 24, 32]
  fp.deviceMemory ∈ [0.25, 0.5, 1, 2, 4, 8]
```

### P4: Fingerprint Uniqueness Across Profiles (Invariant)
Không có 2 profiles nào có cùng Canvas noise seed.
```
∀ p1, p2 ∈ profiles: p1 ≠ p2 → p1.fingerprint.canvas.seed ≠ p2.fingerprint.canvas.seed
```

### P5: Instance Port Uniqueness (Invariant)
Tất cả instances đang chạy phải có `remoteDebuggingPort` khác nhau.
```
∀ i1, i2 ∈ runningInstances: i1 ≠ i2 → i1.remoteDebuggingPort ≠ i2.remoteDebuggingPort
```

### P6: Profile Isolation (Invariant)
Tất cả profiles phải có `userDataDir` khác nhau.
```
∀ p1, p2 ∈ profiles: p1 ≠ p2 → p1.userDataDir ≠ p2.userDataDir
```

### P7: Proxy Password Encryption (Security Property)
Password proxy không được xuất hiện dưới dạng plaintext trong file `proxies.json`.
```
∀ proxy ∈ readFile('data/proxies.json'):
  proxy.password ≠ originalPlaintextPassword
```

### P8: Config Round-Trip (Round-Trip)
Parse config JSON rồi serialize lại phải cho kết quả tương đương.
```
parseConfig(serializeConfig(config)) ≡ config
```

---

## Security Considerations

1. **API chỉ bind localhost**: `API_Server` mặc định bind `127.0.0.1`, không expose ra mạng ngoài.
2. **Proxy password encryption**: Dùng AES-256-GCM với key được derive từ machine ID (không hardcode).
3. **Input validation**: Tất cả API endpoints validate input với Zod schema trước khi xử lý.
4. **Path traversal prevention**: `profilesDir` và các đường dẫn file được sanitize để ngăn path traversal.
5. **Extension security**: Fingerprint extension chỉ được load từ thư mục app-controlled, không cho phép user load extension tùy ý qua API.

---

## File Structure

```
/
├── src/
│   ├── server/
│   │   ├── index.ts              # Entry point, khởi động Express
│   │   ├── routes/
│   │   │   ├── profiles.ts
│   │   │   ├── instances.ts
│   │   │   ├── proxies.ts
│   │   │   ├── runtimes.ts
│   │   │   ├── config.ts
│   │   │   ├── license.ts
│   │   │   ├── backups.ts
│   │   │   └── logs.ts
│   │   ├── managers/
│   │   │   ├── ConfigManager.ts
│   │   │   ├── ProfileManager.ts
│   │   │   ├── InstanceManager.ts
│   │   │   ├── FingerprintEngine.ts
│   │   │   ├── ProxyManager.ts
│   │   │   ├── RuntimeManager.ts
│   │   │   └── LicenseManager.ts
│   │   └── utils/
│   │       ├── crypto.ts         # AES encryption helpers
│   │       ├── portScanner.ts    # Find free port (40000–49999)
│   │       ├── cdpWaiter.ts      # Poll CDP endpoint until ready
│   │       ├── pathSanitizer.ts  # Path traversal prevention
│   │       └── logger.ts         # Winston logger singleton
│   ├── extension/
│   │   ├── manifest.json         # Chrome extension manifest v3
│   │   └── content_script.js     # Fingerprint injection script (template)
│   ├── electron/
│   │   ├── main.ts               # Electron main process
│   │   └── preload.ts            # Preload script
│   └── ui/
│       ├── index.html
│       ├── main.tsx
│       ├── api/
│       │   └── client.ts         # Typed fetch wrapper
│       ├── i18n/
│       │   ├── vi.ts
│       │   └── en.ts
│       ├── pages/
│       │   ├── ProfileList.tsx
│       │   ├── Settings.tsx
│       └── components/
│           ├── ProfileForm.tsx
│           ├── FingerprintEditor.tsx
│           ├── ProxySelector.tsx
│           ├── WelcomeScreen.tsx
│           └── OnboardingWizard.tsx
├── data/
│   ├── config.json
│   ├── instances.json
│   ├── proxies.json
│   ├── fingerprint-db.json
│   ├── license.dat               # AES-encrypted license state
│   ├── activity.log              # JSON lines: session start/stop events
│   ├── logs/
│   │   └── app.log               # Winston rotating log
│   ├── backups/
│   │   └── {timestamp}.zip       # Auto-backup of profile metadata
│   └── profiles/
│       └── {profileId}/
│           ├── profile.json
│           └── Default/          # Chromium user data
├── dist/                         # Build output (gitignored)
├── package.json
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
├── vitest.config.ts
└── electron-builder.yml
```
