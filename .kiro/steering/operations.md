# Operations — Pro5 Chrome Manager

> Kỹ năng vận hành sản phẩm sau khi code xong. Agent tự thực thi tất cả — không cần hỏi user.

---

## 1. Release Management

### Khi nào release?
| Loại | Trigger | Version bump |
|------|---------|-------------|
| Hotfix | Bug ảnh hưởng core feature (launch/stop/license) | patch: `v1.0.1` |
| Minor | Feature mới hoàn chỉnh, không breaking | minor: `v1.1.0` |
| Major | Breaking change API hoặc data schema | major: `v2.0.0` |

### Quy trình release
1. Chạy `npx tsc --noEmit` + `npx vitest run` — phải pass 100%
2. Cập nhật `CHANGELOG.md` theo format Keep a Changelog
3. Bump version trong `package.json`
4. Commit: `chore: release vX.Y.Z`
5. Tag: `git tag vX.Y.Z` → push tag → GitHub Actions tự build installer
6. Verify installer upload lên GitHub Releases

### Hotfix flow
- Branch từ `main`: `hotfix/vX.Y.Z`
- Fix → test → merge vào `main` → tag ngay
- Không merge vào `dev` trước

### Rollback
- Nếu release mới có critical bug: re-tag version cũ là `latest` trên GitHub Releases
- Thông báo trong release notes: "v X.Y.Z bị rollback, dùng vX.Y.(Z-1)"

---

## 2. Monitoring & Observability

### Server Health
- Endpoint `GET /health` trả về `{ status, uptime, version, memoryMB, activeInstances }`
- Log file tại `data/logs/app-YYYY-MM-DD.log` (winston daily rotate, max 10MB, giữ 7 files)
- Error log riêng: `data/logs/error.log` — chỉ ghi level `error` trở lên

### Metrics cần track (ghi vào log)
- Instance launch time (ms)
- Instance launch success/fail rate
- CDP connection timeout count
- License validation latency (ms)
- Proxy test success/fail rate

### Alerting (local — không có cloud)
- Nếu server crash và restart: ghi `data/logs/crash.log` với timestamp + last error
- Nếu `activeInstances` > 20: log warning (resource pressure)
- Nếu disk usage `data/` > 5GB: log warning

### Observability cho agent
- Trước khi làm task liên quan đến running instances: đọc `data/instances.json` để biết state thực tế
- Sau mỗi deploy/restart: verify `/health` endpoint trả về 200

---

## 3. Incident Response

### Playbook theo loại incident

**Server không start được**
1. Đọc `data/logs/error.log` — tìm dòng cuối cùng trước khi crash
2. Kiểm tra port 3210 có bị chiếm không
3. Kiểm tra `data/config.json` có valid JSON không
4. Fix → restart → verify `/health`

**Chromium instance zombie (process còn nhưng CDP không respond)**
1. Đọc `data/instances.json` — tìm instances có status `running` nhưng PID không còn
2. Kill PID nếu còn, cleanup `instances.json`
3. InstanceManager đã có reconcile logic khi restart — trigger restart nếu cần

**data/ bị corrupt**
1. Dừng server ngay
2. Kiểm tra từng file: `config.json`, `instances.json`, `proxies.json`
3. File nào invalid JSON → restore từ backup gần nhất (`data/backups/`)
4. Nếu không có backup → recreate với defaults (mất data proxy/config, profiles vẫn còn trong `data/profiles/`)

**License validation loop fail**
1. Kiểm tra `data/license.dat` có tồn tại và decrypt được không
2. Nếu LemonSqueezy API unreachable → grace period 7 ngày tự động kick in
3. Nếu `license.dat` corrupt → xóa file, user cần activate lại

**Memory leak / high CPU**
1. Log `process.memoryUsage()` mỗi 5 phút vào metrics log
2. Nếu RSS > 500MB: restart server (graceful — đóng tất cả instances trước)
3. Root cause: thường là Chromium process không được cleanup đúng cách

---

## 4. Data Operations

### Backup Strategy
- Auto-backup mỗi 24h: zip tất cả `profile.json` vào `data/backups/{YYYY-MM-DD}.zip`
- Giữ tối đa 7 bản (Task 19)
- KHÔNG backup `Default/` folder (quá lớn, chứa browser cache)
- Backup `data/proxies.json` và `data/config.json` vào cùng zip

### Migration Safety
- Mỗi breaking change schema → tăng `schemaVersion` trong profile/config
- `migrateProfile()` chạy tự động khi load — không bao giờ xóa field cũ ngay
- Deprecated fields: giữ ít nhất 2 version trước khi xóa
- Nếu migration fail: log error + giữ nguyên file gốc, KHÔNG ghi đè

### Data Integrity Checks
- Khi server start: validate tất cả `profile.json` với Zod schema
- Profile nào fail validation: đánh dấu `status: 'corrupted'`, không load vào memory
- Ghi report vào `data/logs/integrity-YYYY-MM-DD.log`

### Recovery Procedure
```
1. Stop server
2. Copy data/ → data-backup-manual/
3. Restore từ backup zip
4. Validate với Zod
5. Start server
6. Verify profile count khớp
```

---

## 5. License & Revenue Operations

### Activation Flow
- User nhập license key → POST `/api/license/activate`
- Gọi LemonSqueezy API với `{ license_key, instance_name: machineId }`
- Nếu valid: lưu `LicenseState` AES-encrypted vào `data/license.dat`
- Nếu fail: trả về error cụ thể (invalid key / already activated / network error)

### Re-validation (background, mỗi 30 ngày)
- Silent call đến LemonSqueezy API
- Nếu success: reset grace period timer
- Nếu network fail: bắt đầu đếm grace period 7 ngày
- Nếu key bị revoke: set status `expired`, block createProfile ngay

### Machine ID thay đổi (reinstall / hardware change)
- Grace period 7 ngày tự động
- Trong grace period: hiển thị warning badge nhưng vẫn cho dùng
- Sau 7 ngày: block, yêu cầu deactivate trên máy cũ rồi activate lại

### Abuse Detection
- Nếu LemonSqueezy trả về `already_activated` với machineId khác: log warning
- Không tự revoke — để LemonSqueezy dashboard xử lý
- Ghi vào `data/logs/license-audit.log`: mọi activate/deactivate với timestamp + machineId

### Free Tier Enforcement
- Limit: 10 profiles
- Check trong `ProfileManager.createProfile()` trước khi tạo
- Hiển thị upgrade modal với link: `https://pro5chrome.lemonsqueezy.com`

---

## 6. User Support Pipeline

### Bug Report Flow
1. User report bug → GitHub Issues (label: `bug`)
2. Agent đọc Issues khi bắt đầu session (nếu có GitHub CLI available: `gh issue list --label bug`)
3. Triage: reproduce được → tạo task trong `tasks.md` với priority
4. Fix → close issue với reference commit

### Issue Priority
| Label | Ý nghĩa | SLA |
|-------|---------|-----|
| `critical` | Data loss, crash on start, license block sai | Fix trong session hiện tại |
| `bug` | Feature không hoạt động đúng | Task tiếp theo |
| `enhancement` | Feature request | Backlog, evaluate sau |

### Reproduction Template
Trước khi fix bug, luôn viết reproduction steps:
```
Environment: Windows / Chrome version / Pro5 version
Steps: 1. ... 2. ... 3. ...
Expected: ...
Actual: ...
```

### Known Issues Log
Ghi vào `memory.md` → "Log các bug đáng nhớ" để không fix lại bug cũ theo cách sai.

---

## 7. Distribution & Updates

### Auto-Update (Task 22)
- Check on startup + mỗi 24h (electron-updater)
- Silent download trong background
- Notify user khi ready: "Phiên bản mới X.Y.Z — Cập nhật ngay / Để sau"
- KHÔNG force update — user quyết định

### Rollback Bad Release
1. Xóa release khỏi GitHub Releases (hoặc mark as pre-release)
2. Re-publish version cũ với note "Recommended"
3. electron-updater sẽ không offer version bị xóa

### Installer Signing (Windows)
- NSIS installer cần code signing để tránh SmartScreen warning
- Nếu chưa có cert: document rõ trong README "Bấm 'More info' → 'Run anyway'"
- Khi có cert: cấu hình trong `electron-builder.yml` → `win.certificateFile`

### Distribution Channels
- Primary: GitHub Releases (free)
- Secondary: website landing page (link đến GitHub Releases)
- KHÔNG distribute qua third-party sites

---

## 8. Security Operations

### Dependency Audit
- Chạy `npm audit` sau mỗi `npm install`
- High/Critical severity: fix ngay trước khi release
- Moderate: fix trong sprint tiếp theo
- Low: track, fix khi convenient

### CVE Response
1. Phát hiện CVE trong dependency → check xem có exploit vector không
2. Nếu có: bump dependency ngay, test, hotfix release
3. Nếu không: schedule fix trong minor release tiếp theo

### Secret Management
- KHÔNG commit secrets vào repo
- Secrets trong code: `LEMONSQUEEZY_STORE_ID`, `GH_TOKEN` → chỉ qua env vars / GitHub Secrets
- Machine ID key cho AES: derive từ hardware, không hardcode
- Rotate: nếu phát hiện secret bị leak → invalidate ngay, generate mới

### Path Traversal & Input Validation
- `pathSanitizer.ts` đã apply vào ProfileManager
- Mọi endpoint nhận `profileId` hoặc file path: phải qua `sanitizePath()` trước
- Zod validation trên tất cả request body — không có exception

### Audit Log
- Mọi thao tác nhạy cảm ghi vào `data/logs/audit.log`:
  - License activate/deactivate
  - Profile import/export
  - Config thay đổi
  - Server start/stop

---

## 9. Growth & Analytics (Privacy-first)

### Metrics Thu Thập (local only, không gửi server)
- Số profiles tạo (aggregate, không PII)
- Feature usage: launch count, session check count, proxy test count
- Error rate theo feature
- Lưu vào `data/analytics.json` (local only)

### Conversion Tracking
- Free → Paid: khi user activate license key, ghi timestamp vào `license.dat`
- Churn signal: license expire + không renew sau 30 ngày

### Feature Adoption
- Nếu feature X chưa được dùng sau 30 ngày: xem xét simplify hoặc remove
- Track qua analytics.json: `{ featureName, lastUsed, useCount }`

### Privacy Rules
- KHÔNG gửi bất kỳ data nào ra ngoài trừ: LemonSqueezy license validation, fingerprint DB version check
- Cả hai đều có thể disable qua config
- Không có telemetry, không có crash reporting gửi về server của mình

---

## 10. Capacity Planning

### Resource Limits (per machine)
| Resource | Warning | Critical |
|----------|---------|---------|
| RAM | > 4GB total (app + instances) | > 8GB |
| Disk `data/` | > 5GB | > 10GB |
| Active instances | > 20 | > 50 |
| CPU | > 80% sustained 5min | > 95% |

### Khi đạt Warning threshold
- Log warning vào `data/logs/app.log`
- Hiển thị notification trong UI

### Khi đạt Critical threshold
- Log error
- Từ chối launch instance mới
- Suggest user đóng bớt instances

### Profile Data Growth
- Mỗi profile `Default/` folder có thể lớn đến vài GB (browser cache)
- Implement "Clear Cache" button trong Profile settings (xóa `Default/Cache/` và `Default/Code Cache/`)
- Auto-warn nếu profile folder > 2GB

---

## Checklist Vận Hành Định Kỳ

### Sau mỗi release
- [ ] Verify installer chạy được trên Windows clean install
- [ ] Verify auto-update từ version trước hoạt động
- [ ] Check GitHub Releases có đủ assets không
- [ ] Update `memory.md` với version mới

### Hàng tuần (nếu có user)
- [ ] Đọc GitHub Issues mới
- [ ] Chạy `npm audit`
- [ ] Check `data/logs/error.log` có pattern lạ không

### Hàng tháng
- [ ] Review analytics.json — feature nào được dùng nhiều nhất
- [ ] Check license validation success rate
- [ ] Cleanup old backups nếu > 7 bản
