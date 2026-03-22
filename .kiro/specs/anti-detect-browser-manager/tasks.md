# Implementation Plan

## Task List

- [x] 1. Project Setup & Infrastructure
  - [x] 1.1 Khởi tạo Node.js project với TypeScript, cấu hình tsconfig.json và package.json
  - [x] 1.2 Cài đặt dependencies: express, ws, zod, archiver, uuid, proxy-chain và dev dependencies
  - [x] 1.3 Tạo cấu trúc thư mục src/server, src/extension, src/ui
  - [x] 1.4 Cấu hình build scripts (tsc cho server, vite cho UI)

- [x] 2. Logger (winston)
  - [x] 2.1 Cài đặt winston, winston-daily-rotate-file vào dependencies
  - [x] 2.2 Tạo src/server/utils/logger.ts: file transport tại data/logs/app.log (max 10MB, giữ 5 files), console transport cho dev
  - [x] 2.3 Export logger singleton — tất cả modules sau đây dùng logger thay vì console

- [x] 3. API Server Bootstrap
  - [x] 3.1 Implement src/server/index.ts: khởi động Express, bind 127.0.0.1:3210, mount routes placeholder, serve static UI
  - [x] 3.2 Implement GET /health endpoint trả về { status: 'ok', uptime, version }
  - [x] 3.3 Implement GET /api/logs endpoint: đọc 200 dòng cuối của data/logs/app.log, trả về array of log lines
  - [x] 3.4 Implement global error handler middleware (trả về JSON 400/500)
  - [x] 3.5 Implement CORS middleware cho localhost origins
  - [x] 3.6 Implement request logger middleware dùng logger từ Task 2 (log method, path, status, duration)

- [x] 4. ConfigManager
  - [x] 4.1 Implement ConfigManager: đọc/ghi data/config.json với Zod schema validation
  - [x] 4.2 Tạo default config nếu file không tồn tại khi khởi động
  - [x] 4.3 Implement API routes: GET /api/config, PUT /api/config
  - [x] 4.4 Thêm configVersion: number và onboardingCompleted: boolean (default: false) vào AppConfigSchema; implement migrateConfig() cho future migrations
  - [x] 4.5 Viết unit tests cho ConfigManager (round-trip property P8)

- [x] 5. UI Foundation (Ant Design + React Router)
  - [x] 5.1 Cài đặt antd, @ant-design/icons, react-router-dom vào dependencies
  - [x] 5.2 Cấu hình Ant Design ConfigProvider trong src/ui/main.tsx với theme token (dark/light)
  - [x] 5.3 Implement App layout: Sider navigation (Profiles, Settings, Logs), Header (license badge, language toggle), Content area
  - [x] 5.4 Setup React Router: routes /profiles (default), /settings, /logs
  - [x] 5.5 Implement i18n foundation: src/ui/i18n/vi.ts + en.ts, useTranslation hook đọc từ config.uiLanguage
  - [x] 5.6 Implement API client: src/ui/api/client.ts với typed fetch wrapper, error handling chuẩn

- [x] 6. ProfileManager
  - [x] 6.1 Định nghĩa Profile interface với schemaVersion: number (current = 1), lastUsedAt, totalSessions, owner
  - [x] 6.2 Implement migrateProfile(raw, targetVersion): migration functions tuần tự, handle profile không có schemaVersion (v0)
  - [x] 6.3 Implement ProfileManager: scan profilesDir, load profiles vào in-memory cache, chạy migration khi load
  - [x] 6.4 Implement createProfile(): sinh UUID v4, tạo thư mục, sinh fingerprint mặc định
  - [x] 6.5 Implement updateProfile(), deleteProfile() — deleteProfile cleanup extension dir
  - [x] 6.6 Implement search/filter: theo tên, tag, group, status trong 200ms
  - [x] 6.7 Implement import profile từ thư mục user data có sẵn (detect Default/ folder)
  - [x] 6.8 Implement export profile thành .zip với archiver (profile.json + Default/)
  - [x] 6.9 Implement API routes: GET/POST /api/profiles, GET/PUT/DELETE /api/profiles/:id, POST /api/profiles/import, GET /api/profiles/:id/export, POST /api/profiles/import-bulk
  - [x] 6.10 Viết unit tests (UUID uniqueness P1, metadata round-trip P2, isolation P6, migration v0→v1)

- [x] 7. FingerprintEngine + FingerprintDB
  - [x] 7.1 Tạo data/fingerprint-db.json với UA strings (Chrome 120-131 Windows/Mac/Linux), WebGL renderers hợp lệ theo OS, font lists theo OS
  - [x] 7.2 Implement FingerprintDB loader: đọc từ fingerprint-db.json, fallback về hardcoded defaults nếu file lỗi
  - [x] 7.3 Định nghĩa FingerprintConfig interface đầy đủ (userAgent, platform, canvas, webgl, audio, fonts, timezone, screen, webrtcPolicy)
  - [x] 7.4 Implement generateFingerprint(): sinh ngẫu nhiên từ FingerprintDB, đảm bảo consistency (UA platform khớp platform field, resolution hợp lệ)
  - [x] 7.5 Implement Chrome extension template: manifest.json với "world": "MAIN" cho content script (Chrome 111+), fallback inject <script> tag cho Chrome < 111
  - [x] 7.6 Implement prepareExtension(profileId, fingerprint): generate content_script.js với fingerprint values baked in, ghi vào {dataDir}/extensions/{profileId}/
  - [x] 7.7 Override trong content script: navigator properties, Canvas toDataURL/getImageData, WebGL getParameter, AudioContext, Intl.DateTimeFormat timezone
  - [x] 7.8 Implement WebRTC leak protection (webrtcPolicy flag → Chrome flag --webrtc-ip-handling-policy)
  - [x] 7.9 Implement background DB version check khi server khởi động: fetch fingerprint-db-version.json, so sánh version, tải fingerprint-db.json mới nếu có; skip silently nếu offline
  - [x] 7.10 Viết unit tests (fingerprint consistency P3, uniqueness P4, UA platform matching)

- [x] 8. ProxyManager
  - [x] 8.1 Implement ProxyManager: CRUD cho danh sách proxy, lưu vào data/proxies.json
  - [x] 8.2 Implement AES-256-GCM encryption cho proxy password (key từ machine ID via src/server/utils/crypto.ts)
  - [x] 8.3 Implement testProxy(): gửi request đến https://api.ipify.org qua proxy, trả về IP, timeout 10s
  - [x] 8.4 Implement detectTimezoneFromProxy(): gọi https://ipapi.co/{ip}/timezone
  - [x] 8.5 Implement buildProxyConfig(proxy): với HTTP/HTTPS trả về --proxy-server flag; với SOCKS5+auth dùng proxy-chain tạo local forwarder (127.0.0.1:random), trả về local port để cleanup sau
  - [x] 8.6 Implement API routes: GET/POST /api/proxies, PUT/DELETE /api/proxies/:id, POST /api/proxies/:id/test
  - [x] 8.7 Viết unit tests (password encryption P7, buildProxyConfig output format)

- [x] 9. RuntimeManager
  - [x] 9.1 Implement RuntimeManager: load runtimes từ config, kiểm tra executable tồn tại với fs.access
  - [x] 9.2 Implement auto-select runtime theo thứ tự ưu tiên: centbrowser > chrome > chromium > msedge
  - [x] 9.3 Implement API routes: GET/POST /api/runtimes, PUT/DELETE /api/runtimes/:key
  - [x] 9.4 Viết unit tests cho runtime availability check

- [x] 10. InstanceManager
  - [x] 10.1 Implement src/server/utils/portScanner.ts: tìm free port trong range 40000-49999
  - [x] 10.2 Implement src/server/utils/cdpWaiter.ts: poll /json/version cho đến khi sẵn sàng hoặc timeout 30s
  - [x] 10.3 Implement launchInstance(): resolve runtime → buildProxyConfig → prepareExtension → build Chrome flags → spawn → waitForCDP → save to instances.json
  - [x] 10.4 Implement stopInstance(): gửi SIGTERM, đợi 3s, nếu còn thì kill; cleanup proxy-chain forwarder nếu có
  - [x] 10.5 Implement health check loop: setInterval 30s, poll CDP, cập nhật status → unreachable nếu timeout
  - [x] 10.6 Implement session check: spawn headless instance, navigate đến URL, detect login state bằng cách kiểm tra URL sau redirect (nếu redirect về login page → logged_out, nếu ở lại URL gốc → logged_in), timeout theo sessionCheck.timeoutMs, đóng instance sau khi xong; IF không có runtime available THEN trả về `{ result: 'error', reason: 'no_runtime' }`
  - [x] 10.7 Persist instances state vào data/instances.json, reconcile khi restart (mark stale nếu PID không còn)
  - [x] 10.8 Implement API routes: POST /api/profiles/:id/start, POST /api/profiles/:id/stop, GET /api/instances, POST /api/instances/stop-all, POST /api/profiles/:id/session-check
  - [x] 10.9 Viết unit tests (port uniqueness P5, port scanner không trả về port đã dùng)

- [x] 11. WebSocket & Real-time Updates
  - [x] 11.1 Setup ws server trên cùng HTTP server với Express
  - [x] 11.2 Broadcast events: instance:started, instance:stopped, instance:status-changed (payload: { profileId, status, port })
  - [x] 11.3 Implement client-side WebSocket hook trong UI: auto-reconnect với exponential backoff

- [x] 12. Web UI - Profile List
  - [x] 12.1 Implement ProfileList page: Ant Design Table với columns (checkbox, tên, status badge, proxy, runtime, tags, lastUsedAt, actions)
  - [x] 12.2 Implement search/filter toolbar: Input.Search, Select filter by group/tag/status, Sort dropdown
  - [x] 12.3 Implement bulk actions toolbar: Start Selected, Stop Selected, Delete Selected (với confirm)
  - [x] 12.4 Implement real-time status badge updates qua WebSocket hook
  - [x] 12.5 Implement empty state: hiển thị WelcomeScreen nếu chưa có profile nào và onboardingCompleted = false
  - [x] 12.6 Hiển thị owner column trong ProfileList table

- [x] 13. Web UI - Profile Form
  - [x] 13.1 Implement ProfileForm Drawer với 4 tabs (Ant Design Tabs): General, Proxy, Fingerprint, Activity
  - [x] 13.2 Tab General: Form fields tên, ghi chú, group, tags (Select mode="tags"), runtime selector
  - [x] 13.3 Tab Proxy: ProxySelector — chọn từ danh sách proxy đã lưu hoặc nhập inline, nút Test Proxy hiển thị IP kết quả
  - [x] 13.4 Tab Fingerprint: FingerprintEditor — hiển thị tất cả fields, nút Randomize, inline edit từng field
  - [x] 13.5 Implement confirmation Modal cho thao tác xóa Profile
  - [x] 13.6 Implement bulk import UI: drag & drop nhiều file .zip cùng lúc (Ant Design Upload dragger), gọi POST /api/profiles/import-bulk

- [x] 14. Web UI - Settings
  - [x] 14.1 Implement Settings page với Ant Design Tabs: General, Runtimes, Backup, Logs
  - [x] 14.2 Tab General: cấu hình profilesDir, API host/port, sessionCheck, uiLanguage, nút "Xem lại hướng dẫn"
  - [x] 14.3 Tab Runtimes: danh sách runtimes, thêm/sửa/xóa, hiển thị available/unavailable badge
  - [x] 14.4 Tab Backup: danh sách backups theo ngày, nút Restore, nút Export all as .zip
  - [x] 14.5 Tab Logs: hiển thị 200 dòng log gần nhất từ GET /api/logs, auto-refresh

- [x] 15. Security & Hardening
  - [x] 15.1 Implement path traversal prevention trong src/server/utils/pathSanitizer.ts: resolve path và verify prefix
  - [x] 15.2 Áp dụng pathSanitizer cho tất cả file operations trong ProfileManager, ConfigManager
  - [x] 15.3 Verify API_Server chỉ bind 127.0.0.1, không bind 0.0.0.0
  - [x] 15.4 Audit tất cả endpoints: Zod validation trên mọi request body và params

- [x] 16. Onboarding / First-Run Experience
  - [x] 16.1 onboardingCompleted đã được thêm vào AppConfig tại Task 4.4 — implement WelcomeScreen component: hiển thị khi profile list trống và onboardingCompleted = false
  - [x] 16.2 Implement OnboardingWizard (Ant Design Steps): bước 1 chọn runtime, bước 2 tạo profile, bước 3 mở profile
  - [x] 16.3 Lưu onboardingCompleted = true sau khi hoàn thành hoặc bỏ qua

- [x] 17. Keyboard Shortcuts
  - [x] 17.1 Implement global keyboard handler trong ProfileList: Ctrl+N (new), Ctrl+F (focus search), Delete (xóa selected), Enter (start/open highlighted)
  - [x] 17.2 Implement Escape handler để đóng Drawer/Modal đang mở
  - [x] 17.3 Implement arrow key navigation: highlight profile khi dùng phím mũi tên lên/xuống
  - [x] 17.4 Implement ShortcutsHelp Modal: hiển thị khi nhấn ? hoặc Ctrl+/

- [x] 18. Free Tier & Licensing
  - [x] 18.1 Implement LicenseManager: kiểm tra số profile hiện tại vs giới hạn free tier (10 profiles)
  - [x] 18.2 Implement hybrid license validation: gọi **LemonSqueezy License API** (`https://api.lemonsqueezy.com/v1/licenses/validate`) khi activate lần đầu với `{ license_key, instance_name: machineId }`; lưu LicenseState AES-encrypted vào data/license.dat; re-verify với LemonSqueezy mỗi 30 ngày trong nền (silent). `LEMONSQUEEZY_STORE_ID` cấu hình qua env var.
  - [x] 18.3 Implement grace period 7 ngày: (a) khi server không reach được sau 30 ngày, (b) khi machineId không khớp
  - [x] 18.4 Implement deactivate: xóa license.dat local
  - [x] 18.5 Implement API routes: POST /api/license/activate, POST /api/license/deactivate, GET /api/license/status
  - [x] 18.6 Thêm license status badge vào App Header: Free/Pro/Expired + số profiles dùng/giới hạn
  - [x] 18.7 Block createProfile() và hiển thị upgrade Modal khi vượt giới hạn free tier

- [x] 19. Backup & Restore
  - [x] 19.1 Implement auto-backup: setInterval 24h, zip tất cả profile.json vào data/backups/{timestamp}.zip
  - [x] 19.2 Implement backup rotation: giữ tối đa 7 bản, xóa bản cũ hơn
  - [x] 19.3 Implement API routes: GET /api/backups, POST /api/backups/restore/:timestamp, GET /api/backups/export

- [x] 20. Profile Activity Log
  - [x] 20.1 Thêm lastUsedAt, totalSessions vào Profile interface (đã có từ Task 6.1)
  - [x] 20.2 Cập nhật InstanceManager: ghi log start/stop với duration vào data/activity.log (JSON lines format)
  - [x] 20.3 Cập nhật ProfileManager: update lastUsedAt và increment totalSessions sau mỗi session stop
  - [x] 20.4 Implement API route: GET /api/profiles/:id/activity — trả về 50 sessions gần nhất
  - [x] 20.5 Implement Activity tab trong Profile detail view (Drawer tab thứ 4): bảng sessions với start, end, duration

- [x] 21. Electron Desktop App
  - [x] 21.1 Cài đặt electron, electron-builder vào devDependencies
  - [x] 21.2 Tạo src/electron/main.ts: nhận dataDir từ app.getPath('userData'), truyền vào Express server, tạo BrowserWindow trỏ đến localhost:3210/ui
  - [x] 21.3 Tạo src/electron/preload.ts: preload script cơ bản (contextIsolation)
  - [x] 21.4 Thêm tray icon: minimize to system tray, menu "Open", "Quit"
  - [x] 21.5 Bắt uncaught exceptions trong main process, ghi vào logger trước khi crash
  - [x] 21.6 Đảm bảo app shutdown Express server và tất cả Chromium instances khi đóng (app.on('before-quit'))
  - [x] 21.7 Tạo tsconfig.electron.json: compile src/electron/ → dist/electron-main/
  - [x] 21.8 Tạo electron-builder.yml: target Windows NSIS installer, bundle dist/server + dist/ui + dist/electron-main + src/extension
  - [x] 21.9 Thêm scripts vào package.json: dev:electron, build:electron

- [x] 22. Auto-Update
  - [x] 22.1 Cài đặt electron-updater vào devDependencies
  - [x] 22.2 Cấu hình electron-builder.yml publish lên GitHub Releases
  - [x] 22.3 Implement auto-update logic trong main.ts: check on startup + mỗi 24h, silent download
  - [x] 22.4 Implement update notification: Ant Design notification/modal với changelog, nút "Cập nhật ngay" / "Để sau"

- [x] 24. Integration Testing
  - [x] 24.1 Viết integration test: tạo profile → export .zip → import lại → verify metadata round-trip (không cần Chrome)
  - [x] 24.2 Viết integration test: generateFingerprint() → prepareExtension() → verify extension files được tạo đúng
  - [x] 24.3 Viết integration test: proxy password encrypt → save → load → decrypt → verify plaintext (không cần proxy thật)
  - [x] 24.4* Viết E2E test với Chrome thật: tạo profile → start instance → kiểm tra CDP endpoint (optional, cần Chrome cài sẵn)

- [x] 25. CI/CD & Release Pipeline
  - [x] 25.1 Tạo `.github/workflows/ci.yml`: chạy `npm test` + `npx tsc --noEmit` trên mỗi push/PR
  - [x] 25.2 Tạo `.github/workflows/release.yml`: trigger khi push tag `v*.*.*` → build Electron installer → upload lên GitHub Releases tự động
  - [x] 25.3 Cấu hình electron-builder.yml publish GitHub Releases (dùng `GH_TOKEN` secret)
  - [x] 25.4 Tạo `CHANGELOG.md` với format Keep a Changelog; cập nhật mỗi release
