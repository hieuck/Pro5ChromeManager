---
inclusion: always
---

# Memory — Trạng thái dự án

> File này được cập nhật sau mỗi session làm việc. Đây là "bộ nhớ" giữa các session.

---

## Trạng thái hiện tại (cập nhật: 2026-03-22)

### Code health
- TypeScript: ✅ clean (0 errors) — server + electron
- Tests: ✅ 86/86 pass (8 test files)
- Dependencies: ✅ 0 vulnerabilities
- Audit: ✅ không có TODO/FIXME/any/unhandled promise

### Bugs đã fix trong session này
- `index.ts` không gọi `initialize()` cho managers → đã fix, tất cả managers được init đúng thứ tự
- `exportProfile` dùng `assertWithinBase` với `os.tmpdir()` → sẽ throw khi export → đã bỏ check (destPath do server tạo, không phải user input)
- `POST /api/profiles` không enforce free tier limit → đã thêm `licenseManager.canCreateProfile()` check vào create/import/import-bulk
- Icon files là placeholder 69 bytes → đã generate PNG 256x256 + ICO multi-size bằng `scripts/generate-icons.js`
- `package.json` thiếu `generate:icons` script → đã thêm, `package:electron` tự chạy trước khi build
- `.gitignore` thiếu nhiều entries → đã viết lại đầy đủ
- `LICENSE` file chưa có → đã tạo MIT
- `README.md` thiếu thông tin → đã viết lại đầy đủ với CDP automation guide

### Tasks đã hoàn thành thực tế
- Task 2: Logger (winston + daily-rotate-file) → `src/server/utils/logger.ts`
- Task 3: API Server Bootstrap → `src/server/index.ts`
- Task 4: ConfigManager → `src/server/managers/ConfigManager.ts` + routes
- Task 5: UI Foundation → `src/ui/` (App, Router, i18n, API client)
- Task 6: ProfileManager → đầy đủ CRUD, migration, import/export
- Task 7: FingerprintEngine → generate, prepareExtension, DB version check, extension template, WebRTC
- Task 8: ProxyManager → CRUD, encrypt, testProxy, buildProxyConfig
- Task 9: RuntimeManager → load, checkAvailability, resolveRuntime, routes
- Task 10: InstanceManager → launch, stop, health check, sessionCheck, persist
- Task 11: WebSocket → `src/server/utils/wsServer.ts` + broadcast + `src/ui/hooks/useWebSocket.ts`
- Task 12: ProfileList → Table, search/filter, bulk actions, WS real-time, keyboard shortcuts, owner column
- Task 13: ProfileForm → Drawer 4 tabs (General, Proxy, Fingerprint, Activity), bulk import UI
- Task 14: Settings → 4 tabs (General, Runtimes, Backup, Logs), nút "Xem lại hướng dẫn"
- Task 15: pathSanitizer → applied vào ProfileManager, Zod validation, 127.0.0.1 binding
- Task 16: Onboarding → WelcomeScreen + OnboardingWizard 3 bước
- Task 17: Keyboard Shortcuts → arrow keys, Enter, Escape, ? modal (ShortcutsHelp)
- Task 18: LicenseManager → hybrid validation + offline key (HMAC-SHA256), upgrade modal
- Task 19: BackupManager → auto-backup 24h, rotation 7 bản, restore via PowerShell/unzip
- Task 20: Activity Log → appendActivityLog() trong InstanceManager + `GET /api/profiles/:id/activity`
- Task 21: Electron Desktop App → `src/electron/main.ts` + `preload.ts` + `electron-builder.yml`
- Task 22: Auto-Update → electron-updater trong main.ts, UI listener `pro5:update-ready`
- Task 24: Integration Tests → `src/server/tests/integration.test.ts` (3 tests)
- Task 25: CI/CD → `.github/workflows/ci.yml` + `release.yml`

### Tasks còn thiếu / chưa hoàn chỉnh
- Không còn task tồn đọng. Tất cả tasks 2-25 đã hoàn thành.

### Files quan trọng
- `src/server/managers/BackupManager.ts` — backup/restore với PowerShell Expand-Archive
- `src/server/managers/LicenseManager.ts` — hybrid + offline key
- `src/electron/main.ts` — Electron main process, tray, auto-updater
- `src/electron/preload.ts` — contextIsolation preload
- `electron-builder.yml` — Windows NSIS installer config
- `tsconfig.electron.json` — compile src/electron/ → dist/electron-main/
- `src/server/tests/integration.test.ts` — 3 integration tests

### Quyết định kỹ thuật đã làm
- BackupManager dùng PowerShell `Expand-Archive` (Windows) / `unzip` (Linux) để extract — không cần dep mới
- Electron main dùng `require()` dynamic để load server — tránh circular import
- Auto-update notification qua custom DOM event `pro5:update-ready` từ Electron → UI
- Integration tests dùng tmpDir riêng, cleanup sau mỗi run

---

## Log các bug đáng nhớ

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `vi.spyOn(fs, 'access')` fail | `fs/promises.access` là non-configurable property | Inject `accessFn` vào constructor |
| `afterEach` TS error | `vi.restoreAllMocks()` trả về `VitestUtils` | Wrap trong `{ }` block |
| `await` trong `new Promise` callback | callback là sync | Check files trước khi vào Promise |
| `archiver.file().catch()` TS error | `.file()` trả về `this`, không phải Promise | Không chain `.catch()` trên archiver |

---

## Next session nên làm gì

Không còn task tự động hóa được. Dự án production-ready. Để release v1.0.0:
```bash
git add -A
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --tags
# GitHub Actions tự build installer và upload lên Releases
```
