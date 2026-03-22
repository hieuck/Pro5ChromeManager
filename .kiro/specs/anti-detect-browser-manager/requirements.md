# Requirements Document

## Introduction

Phần mềm quản lý trình duyệt đa profile (Anti-Detect Browser Manager) cho phép người dùng tạo và vận hành nhiều profile trình duyệt Chromium độc lập, mỗi profile có fingerprint riêng biệt và proxy riêng. Phần mềm cạnh tranh trực tiếp với GPMLogin và PionLogin, phục vụ các use case như quản lý tài khoản mạng xã hội, affiliate marketing, và e-commerce. Hệ thống bao gồm một backend API (Node.js), giao diện web UI chạy local, và tích hợp với các Chromium-based runtime (Chrome, Edge, CentBrowser, Chromium).

## Glossary

- **Profile**: Một tập hợp dữ liệu trình duyệt độc lập bao gồm user data directory, fingerprint config, proxy config, và metadata.
- **Profile_Manager**: Module quản lý vòng đời của các Profile (tạo, sửa, xóa, nhóm hóa).
- **Fingerprint**: Tập hợp các thuộc tính trình duyệt dùng để nhận dạng người dùng (User-Agent, Canvas, WebGL, fonts, timezone, screen resolution, v.v.).
- **Fingerprint_Engine**: Module chịu trách nhiệm inject và quản lý Fingerprint cho mỗi Profile.
- **Proxy**: Cấu hình mạng (HTTP/HTTPS/SOCKS5) được gán cho một Profile cụ thể.
- **Proxy_Manager**: Module quản lý danh sách Proxy và gán Proxy cho Profile.
- **Instance**: Một tiến trình trình duyệt đang chạy tương ứng với một Profile.
- **Instance_Manager**: Module quản lý vòng đời của các Instance (khởi động, dừng, giám sát).
- **Runtime**: Một Chromium-based browser executable (Chrome, Edge, CentBrowser, Chromium).
- **Runtime_Manager**: Module quản lý danh sách Runtime khả dụng.
- **API_Server**: Backend HTTP server cung cấp REST API cho UI và automation.
- **Web_UI**: Giao diện người dùng web chạy local, tương tác với API_Server.
- **Session**: Trạng thái đăng nhập của một Profile trên một website cụ thể.
- **Health_Check**: Quá trình kiểm tra trạng thái hoạt động của một Instance.
- **Group**: Tập hợp các Profile được gom nhóm để quản lý hàng loạt.
- **Tag**: Nhãn gán cho Profile để phân loại và lọc.

---

## Requirements

### Requirement 1: Quản lý Profile

**User Story:** As a người dùng, I want tạo và quản lý nhiều profile trình duyệt độc lập, so that tôi có thể vận hành nhiều tài khoản mà không bị liên kết với nhau.

#### Acceptance Criteria

1. THE Profile_Manager SHALL tạo một Profile mới với user data directory riêng biệt tại đường dẫn được cấu hình trong `profilesDir`.
2. WHEN người dùng tạo Profile mới, THE Profile_Manager SHALL gán một UUID duy nhất cho Profile đó.
3. THE Profile_Manager SHALL lưu metadata của Profile (tên, ghi chú, tags, group, ngày tạo, ngày sửa cuối) vào file cấu hình JSON của Profile.
4. WHEN người dùng xóa một Profile, THE Profile_Manager SHALL xóa toàn bộ user data directory và metadata của Profile đó.
5. THE Profile_Manager SHALL hỗ trợ đổi tên Profile mà không làm mất dữ liệu trình duyệt.
6. THE Profile_Manager SHALL hỗ trợ gán Profile vào một Group (single group per profile; dùng Tags cho multi-categorization).
7. THE Profile_Manager SHALL hỗ trợ gán một hoặc nhiều Tag cho mỗi Profile.
8. WHEN người dùng tìm kiếm Profile, THE Profile_Manager SHALL lọc kết quả theo tên, tag, group, và trạng thái Instance trong vòng 200ms.
9. THE Profile_Manager SHALL hỗ trợ sắp xếp danh sách Profile theo tên, ngày tạo, ngày sử dụng cuối, và trạng thái.
10. THE Profile_Manager SHALL hỗ trợ import Profile từ thư mục user data directory có sẵn.
11. THE Profile_Manager SHALL hỗ trợ export Profile thành file archive (.zip) bao gồm user data và fingerprint config.
12. IF file cấu hình Profile bị hỏng hoặc thiếu, THEN THE Profile_Manager SHALL tạo lại cấu hình mặc định và ghi log cảnh báo.

---

### Requirement 2: Fingerprint Spoofing

**User Story:** As a người dùng, I want mỗi profile có fingerprint trình duyệt riêng biệt, so that các website không thể liên kết các tài khoản của tôi với nhau.

#### Acceptance Criteria

1. THE Fingerprint_Engine SHALL inject User-Agent string tùy chỉnh cho mỗi Profile khi khởi động Instance.
2. THE Fingerprint_Engine SHALL spoof giá trị Canvas fingerprint (toDataURL, getImageData) cho mỗi Profile.
3. THE Fingerprint_Engine SHALL spoof thông tin WebGL (renderer, vendor, các tham số WebGL) cho mỗi Profile.
4. THE Fingerprint_Engine SHALL spoof danh sách font được cài đặt trả về qua JavaScript cho mỗi Profile.
5. THE Fingerprint_Engine SHALL spoof timezone của trình duyệt theo cấu hình của Profile.
6. THE Fingerprint_Engine SHALL spoof screen resolution và color depth theo cấu hình của Profile.
7. THE Fingerprint_Engine SHALL spoof navigator properties (platform, language, hardwareConcurrency, deviceMemory) theo cấu hình của Profile.
8. THE Fingerprint_Engine SHALL spoof AudioContext fingerprint cho mỗi Profile.
9. WHEN người dùng tạo Profile mới, THE Fingerprint_Engine SHALL tự động sinh ngẫu nhiên một bộ Fingerprint hợp lệ và nhất quán.
10. THE Fingerprint_Engine SHALL cho phép người dùng tùy chỉnh thủ công từng thuộc tính Fingerprint.
11. WHEN Fingerprint được sinh ngẫu nhiên, THE Fingerprint_Engine SHALL đảm bảo các giá trị nhất quán với nhau (ví dụ: User-Agent phải khớp với platform, WebGL renderer phải hợp lệ với OS).
12. THE Fingerprint_Engine SHALL inject Fingerprint thông qua Chrome extension hoặc CDP (Chrome DevTools Protocol) mà không yêu cầu patch Chromium binary.
13. WHERE người dùng bật tính năng WebRTC leak protection, THE Fingerprint_Engine SHALL ngăn chặn WebRTC leak địa chỉ IP thật.

---

### Requirement 3: Quản lý Proxy

**User Story:** As a người dùng, I want gán proxy riêng cho từng profile, so that mỗi tài khoản hoạt động từ một địa chỉ IP khác nhau.

#### Acceptance Criteria

1. THE Proxy_Manager SHALL hỗ trợ các loại proxy: HTTP, HTTPS, SOCKS4, và SOCKS5.
2. THE Proxy_Manager SHALL hỗ trợ proxy có xác thực (username/password).
3. WHEN người dùng gán Proxy cho Profile, THE Proxy_Manager SHALL lưu cấu hình proxy vào metadata của Profile.
4. WHEN một Instance được khởi động, THE Instance_Manager SHALL áp dụng cấu hình Proxy của Profile tương ứng cho tiến trình trình duyệt đó.
5. THE Proxy_Manager SHALL hỗ trợ kiểm tra kết nối proxy (test proxy) và trả về địa chỉ IP thực tế trong vòng 10 giây.
6. IF proxy không kết nối được, THEN THE Proxy_Manager SHALL trả về thông báo lỗi mô tả rõ nguyên nhân.
7. THE Proxy_Manager SHALL hỗ trợ lưu danh sách proxy để tái sử dụng cho nhiều Profile.
8. WHEN timezone của Profile không được cấu hình thủ công, THE Fingerprint_Engine SHALL tự động đặt timezone phù hợp với vị trí địa lý của Proxy.

---

### Requirement 4: Khởi động và Quản lý Instance

**User Story:** As a người dùng, I want khởi động và quản lý nhiều profile đồng thời, so that tôi có thể làm việc với nhiều tài khoản cùng lúc.

#### Acceptance Criteria

1. WHEN người dùng khởi động một Profile, THE Instance_Manager SHALL tạo một tiến trình Chromium mới với user data directory của Profile đó.
2. THE Instance_Manager SHALL hỗ trợ chạy đồng thời tối thiểu 50 Instance trên cùng một máy (tùy thuộc tài nguyên hệ thống).
3. THE Instance_Manager SHALL gán một remote debugging port duy nhất cho mỗi Instance.
4. WHEN một Instance được khởi động, THE Instance_Manager SHALL lưu PID, port, và thời điểm khởi động vào `instances.json`.
5. WHEN một Instance bị dừng hoặc crash, THE Instance_Manager SHALL cập nhật trạng thái trong `instances.json` trong vòng 5 giây.
6. THE Instance_Manager SHALL hỗ trợ dừng một Instance cụ thể mà không ảnh hưởng đến các Instance khác.
7. THE Instance_Manager SHALL hỗ trợ dừng tất cả Instance đang chạy cùng lúc.
8. THE Instance_Manager SHALL cho phép người dùng chọn Runtime (Chrome, Edge, CentBrowser, Chromium) cho từng Profile.
9. WHEN Runtime được đặt là "auto", THE Instance_Manager SHALL tự động chọn Runtime khả dụng theo thứ tự ưu tiên được cấu hình.
10. THE Instance_Manager SHALL hỗ trợ chế độ headless cho Instance.
11. WHEN người dùng mở một Profile đang chạy, THE Instance_Manager SHALL focus vào cửa sổ Instance đó thay vì tạo Instance mới.

---

### Requirement 5: Health Check và Giám sát

**User Story:** As a người dùng, I want theo dõi trạng thái của các profile đang chạy, so that tôi biết profile nào đang hoạt động bình thường hay gặp sự cố.

#### Acceptance Criteria

1. THE Instance_Manager SHALL thực hiện Health_Check định kỳ cho mỗi Instance đang chạy theo khoảng thời gian được cấu hình (mặc định: 30 giây).
2. WHEN Health_Check phát hiện một Instance không phản hồi, THE Instance_Manager SHALL cập nhật trạng thái Instance thành "unreachable".
3. THE Instance_Manager SHALL phân biệt các trạng thái Instance: `running`, `stopped`, `unreachable`, `stale`.
4. THE Web_UI SHALL hiển thị trạng thái real-time của tất cả Instance thông qua WebSocket hoặc polling.
5. WHEN một Instance chuyển sang trạng thái "unreachable", THE Instance_Manager SHALL ghi log sự kiện với timestamp.
6. THE Instance_Manager SHALL hỗ trợ Session Check: kiểm tra trạng thái đăng nhập của Profile trên một URL cụ thể ở chế độ headless.
7. WHEN Session Check hoàn thành, THE Instance_Manager SHALL trả về kết quả (logged_in / logged_out / error) trong vòng thời gian `sessionCheck.timeoutMs` được cấu hình.

---

### Requirement 6: Quản lý Runtime

**User Story:** As a người dùng, I want cấu hình và sử dụng nhiều loại Chromium runtime khác nhau, so that tôi có thể linh hoạt chọn trình duyệt phù hợp cho từng mục đích.

#### Acceptance Criteria

1. THE Runtime_Manager SHALL đọc danh sách Runtime từ file `config.json` khi khởi động.
2. THE Runtime_Manager SHALL kiểm tra sự tồn tại của file executable cho mỗi Runtime được cấu hình.
3. IF một Runtime executable không tồn tại, THEN THE Runtime_Manager SHALL đánh dấu Runtime đó là "unavailable" và ghi log cảnh báo.
4. THE Runtime_Manager SHALL cho phép người dùng thêm, sửa, xóa Runtime thông qua API.
5. WHEN người dùng thêm Runtime mới, THE Runtime_Manager SHALL xác thực đường dẫn executable trước khi lưu.

---

### Requirement 7: REST API

**User Story:** As a developer, I want tương tác với hệ thống qua REST API, so that tôi có thể tích hợp automation (Puppeteer, Playwright) và xây dựng workflow tự động.

#### Acceptance Criteria

1. THE API_Server SHALL cung cấp REST API trên host và port được cấu hình trong `config.json` (mặc định: 127.0.0.1:3210).
2. THE API_Server SHALL cung cấp endpoint để liệt kê tất cả Profile với thông tin metadata và trạng thái Instance.
3. THE API_Server SHALL cung cấp endpoint để tạo, cập nhật, và xóa Profile.
4. THE API_Server SHALL cung cấp endpoint để khởi động và dừng Instance của một Profile.
5. THE API_Server SHALL trả về `remoteDebuggingPort` của Instance sau khi khởi động thành công để client có thể kết nối qua CDP.
6. THE API_Server SHALL cung cấp endpoint để kiểm tra trạng thái Instance.
7. THE API_Server SHALL trả về response theo định dạng JSON chuẩn với HTTP status code phù hợp.
8. IF một request không hợp lệ được gửi đến API_Server, THEN THE API_Server SHALL trả về HTTP 400 với thông báo lỗi mô tả rõ trường nào không hợp lệ.
9. THE API_Server SHALL cung cấp endpoint health check tại `/health` trả về trạng thái server.
10. THE API_Server SHALL hỗ trợ CORS cho phép Web_UI truy cập từ cùng origin.

---

### Requirement 8: Giao diện Web UI

**User Story:** As a người dùng, I want giao diện đồ họa trực quan để quản lý profile, so that tôi không cần dùng command line để thực hiện các thao tác thường ngày.

#### Acceptance Criteria

1. THE Web_UI SHALL hiển thị danh sách tất cả Profile dưới dạng bảng hoặc lưới với thông tin: tên, trạng thái, proxy, runtime, ngày tạo.
2. THE Web_UI SHALL cung cấp form tạo Profile mới với các trường: tên, ghi chú, group, tags, proxy, runtime, fingerprint config.
3. THE Web_UI SHALL cho phép người dùng khởi động và dừng Instance trực tiếp từ danh sách Profile.
4. THE Web_UI SHALL hiển thị trạng thái Instance với màu sắc phân biệt (xanh: running, đỏ: stopped/unreachable, vàng: stale).
5. THE Web_UI SHALL hỗ trợ chọn nhiều Profile để thực hiện thao tác hàng loạt (bulk start, bulk stop, bulk delete).
6. THE Web_UI SHALL cung cấp trang cài đặt để cấu hình `profilesDir`, `runtimes`, `api`, và `sessionCheck`.
7. THE Web_UI SHALL hỗ trợ ngôn ngữ giao diện tiếng Việt và tiếng Anh, đọc từ cấu hình `uiLanguage`.
8. WHEN người dùng thực hiện thao tác xóa Profile, THE Web_UI SHALL hiển thị hộp thoại xác nhận trước khi thực thi.
9. THE Web_UI SHALL hiển thị thông báo kết quả (success/error) sau mỗi thao tác trong vòng 3 giây.

---

### Requirement 9: Cấu hình Hệ thống

**User Story:** As a người dùng, I want cấu hình các thông số hệ thống, so that tôi có thể tùy chỉnh phần mềm phù hợp với môi trường làm việc của mình.

#### Acceptance Criteria

1. THE API_Server SHALL đọc cấu hình từ file `data/config.json` khi khởi động.
2. THE API_Server SHALL hỗ trợ reload cấu hình mà không cần khởi động lại server.
3. THE API_Server SHALL xác thực tất cả các trường trong `config.json` khi đọc và trả về lỗi mô tả nếu cấu hình không hợp lệ.
4. IF file `config.json` không tồn tại khi khởi động, THEN THE API_Server SHALL tạo file với giá trị mặc định và tiếp tục khởi động.
5. THE API_Server SHALL cung cấp endpoint để đọc và cập nhật cấu hình hệ thống.

---

### Requirement 10: Bảo mật và Cô lập Profile

**User Story:** As a người dùng, I want các profile hoàn toàn cô lập với nhau, so that dữ liệu và hoạt động của tài khoản này không ảnh hưởng đến tài khoản khác.

#### Acceptance Criteria

1. THE Profile_Manager SHALL đảm bảo mỗi Profile sử dụng user data directory riêng biệt, không chia sẻ với Profile khác.
2. THE Instance_Manager SHALL khởi động mỗi Instance với `--user-data-dir` trỏ đúng vào thư mục của Profile tương ứng.
3. THE Fingerprint_Engine SHALL đảm bảo Fingerprint của mỗi Profile là duy nhất và không trùng lặp với Profile khác.
4. THE API_Server SHALL chỉ lắng nghe trên localhost (127.0.0.1) theo mặc định để ngăn truy cập từ mạng ngoài.
5. THE Profile_Manager SHALL không lưu mật khẩu proxy dưới dạng plaintext trong file cấu hình; SHALL sử dụng mã hóa hoặc lưu trữ an toàn.

---

### Requirement 20: Schema Migration

**User Story:** As a developer, I want profile data tự động migrate khi schema thay đổi, so that người dùng không mất dữ liệu khi nâng cấp phiên bản.

#### Acceptance Criteria

1. Mỗi `profile.json` SHALL chứa field `schemaVersion: number` để track version của schema.
2. WHEN ProfileManager load một profile có `schemaVersion` cũ hơn current version, SHALL tự động chạy migration function tương ứng.
3. WHEN migration thành công, SHALL ghi `schemaVersion` mới vào file.
4. IF migration thất bại, SHALL ghi log lỗi và skip profile đó (không crash toàn bộ app).
5. `config.json` SHALL có cơ chế tương tự với field `configVersion`.

---

### Requirement 11: Free Tier & Licensing

**User Story:** As a người dùng mới, I want dùng thử phần mềm miễn phí, so that tôi có thể đánh giá trước khi mua.

#### Acceptance Criteria

1. THE License_Manager SHALL cho phép sử dụng tối đa 10 profiles miễn phí (free tier) mà không cần license key.
2. WHEN người dùng cố tạo Profile thứ 11 ở free tier, THE License_Manager SHALL hiển thị thông báo yêu cầu nâng cấp.
3. THE License_Manager SHALL hỗ trợ kích hoạt license key để mở khóa số lượng profile không giới hạn (hoặc theo gói).
4. WHEN người dùng nhập license key, THE License_Manager SHALL gọi activation server (`ACTIVATION_SERVER_URL`) với `{ key, machineId }` để xác thực; khi thành công lưu trạng thái kích hoạt AES-encrypted vào `data/license.dat`. Activation server URL cấu hình qua env var, không hardcode.
5. AFTER kích hoạt thành công, THE License_Manager SHALL hoạt động offline hoàn toàn trong 30 ngày; sau đó re-verify với server 1 lần trong nền (silent).
6. THE License_Manager SHALL hỗ trợ deactivate license bằng cách xóa `data/license.dat` local.
7. IF server không reach được khi re-verify (sau 30 ngày), THE License_Manager SHALL cho phép dùng tiếp trong grace period 7 ngày.
8. IF `license.dat` tồn tại nhưng `machineId` không khớp (user thay phần cứng), THE License_Manager SHALL cho phép dùng tiếp trong grace period 7 ngày để user liên hệ support.
7. THE Web_UI SHALL hiển thị trạng thái license (free/active/expired) và số profiles đang dùng / giới hạn.

---

### Requirement 12: Team Collaboration

**User Story:** As a team leader, I want chia sẻ profiles với thành viên trong nhóm, so that nhiều người có thể làm việc cùng nhau mà không cần copy thủ công.

#### Acceptance Criteria

1. THE Profile_Manager SHALL hỗ trợ export profile thành file `.zip` để chia sẻ với thành viên khác (đã có ở Requirement 1.11).
2. THE Web_UI SHALL hỗ trợ import hàng loạt nhiều file `.zip` profile cùng lúc.
3. THE Profile_Manager SHALL hỗ trợ gán "owner" cho mỗi Profile để theo dõi ai đang quản lý profile đó.
4. THE Web_UI SHALL hiển thị thông tin owner trong danh sách Profile.
5. THE API_Server SHALL cung cấp endpoint `POST /api/profiles/import-bulk` để import nhiều profiles từ một thư mục.

---

### Requirement 13: Error Logging & Reliability

**User Story:** As a người dùng, I want phần mềm ghi lại lỗi ra file, so that tôi có thể debug khi có sự cố mà không mất thông tin.

#### Acceptance Criteria

1. THE API_Server SHALL ghi tất cả lỗi (error level trở lên) vào file log tại `data/logs/app.log`.
2. THE API_Server SHALL rotate log file khi đạt 10MB, giữ tối đa 5 file log cũ.
3. WHEN một Instance crash hoặc chuyển sang trạng thái unreachable, THE Instance_Manager SHALL ghi log với đầy đủ thông tin: profileId, profileName, pid, port, timestamp, error message.
4. THE Electron app SHALL bắt uncaught exceptions và ghi vào log trước khi crash.
5. THE Web_UI SHALL cung cấp trang "Logs" để xem log gần nhất mà không cần mở file thủ công.

---

### Requirement 14: Auto-Update

**User Story:** As a người dùng, I want phần mềm tự động cập nhật phiên bản mới, so that tôi luôn có fingerprint database mới nhất và tính năng mới mà không cần tải lại thủ công.

#### Acceptance Criteria

1. THE Electron app SHALL kiểm tra phiên bản mới khi khởi động và mỗi 24 giờ bằng `electron-updater`.
2. WHEN có phiên bản mới, THE Electron app SHALL hiển thị thông báo với changelog và nút "Cập nhật ngay" hoặc "Để sau".
3. THE Electron app SHALL tải bản cập nhật ngầm trong nền mà không làm gián đoạn công việc.
4. WHEN tải xong, THE Electron app SHALL hỏi user có muốn restart để áp dụng bản cập nhật không.
5. THE update server SHALL được host trên GitHub Releases để tiết kiệm chi phí.
6. IF kiểm tra update thất bại (không có mạng), THE Electron app SHALL bỏ qua silently và thử lại lần sau.

---

### Requirement 15: Onboarding / First-Run Experience

**User Story:** As a người dùng mới, I want được hướng dẫn khi mở app lần đầu, so that tôi biết cách tạo profile và bắt đầu sử dụng ngay.

#### Acceptance Criteria

1. WHEN app được mở lần đầu tiên (chưa có profile nào), THE Web_UI SHALL hiển thị màn hình welcome thay vì danh sách trống.
2. THE onboarding SHALL hướng dẫn 3 bước: (1) Chọn runtime Chrome/Edge, (2) Tạo profile đầu tiên, (3) Mở profile.
3. THE onboarding SHALL có nút "Bỏ qua" để user có thể tự khám phá.
4. WHEN onboarding hoàn thành, THE Web_UI SHALL lưu trạng thái đã hoàn thành vào config để không hiển thị lại.
5. THE Web_UI SHALL có nút "Xem lại hướng dẫn" trong trang Settings để user có thể xem lại bất cứ lúc nào.

---

### Requirement 16: Fingerprint Database Update

**User Story:** As a người dùng, I want fingerprint database được cập nhật định kỳ, so that các profile không bị phát hiện khi Chrome ra phiên bản mới.

#### Acceptance Criteria

1. THE FingerprintEngine SHALL đọc danh sách User-Agent strings và WebGL renderer từ file `data/fingerprint-db.json`.
2. THE API_Server SHALL kiểm tra phiên bản fingerprint database khi khởi động và so sánh với server.
3. WHEN có database mới, THE API_Server SHALL tải về và cập nhật `data/fingerprint-db.json` trong nền.
4. THE fingerprint database SHALL bao gồm: UA strings theo Chrome version, WebGL renderer/vendor hợp lệ theo OS, danh sách font phổ biến theo OS.
5. IF không tải được database mới, THE FingerprintEngine SHALL tiếp tục dùng database cũ và ghi log cảnh báo.

---

### Requirement 17: Backup & Restore

**User Story:** As a người dùng, I want có backup tự động cho profiles, so that tôi không mất dữ liệu khi xảy ra sự cố.

#### Acceptance Criteria

1. THE Profile_Manager SHALL tự động backup toàn bộ `profile.json` (metadata, không bao gồm user data) vào `data/backups/` mỗi 24 giờ.
2. THE Profile_Manager SHALL giữ tối đa 7 bản backup gần nhất, xóa bản cũ hơn.
3. THE Web_UI SHALL cung cấp tính năng "Restore from backup" trong trang Settings, hiển thị danh sách backup theo ngày.
4. WHEN restore, THE Profile_Manager SHALL khôi phục metadata của tất cả profiles từ bản backup được chọn.
5. THE Web_UI SHALL cho phép export toàn bộ backup thành một file `.zip` để lưu trữ ngoài.

---

### Requirement 18: Profile Activity Log

**User Story:** As a người dùng, I want xem lịch sử hoạt động của từng profile, so that tôi biết profile nào đã được dùng khi nào và làm gì.

#### Acceptance Criteria

1. THE Instance_Manager SHALL ghi log mỗi khi một Instance được khởi động hoặc dừng, bao gồm: profileId, action (start/stop), timestamp, duration.
2. THE Profile_Manager SHALL lưu `lastUsedAt` và `totalSessions` vào `profile.json` sau mỗi session.
3. THE Web_UI SHALL hiển thị activity log của từng profile trong Profile detail view: danh sách sessions với thời gian bắt đầu, kết thúc, và thời lượng.
4. THE Web_UI SHALL hiển thị `lastUsedAt` và `totalSessions` trong danh sách Profile.

---

### Requirement 19: Keyboard Shortcuts

**User Story:** As a power user, I want dùng phím tắt để thao tác nhanh, so that tôi không cần click nhiều khi quản lý nhiều profile.

#### Acceptance Criteria

1. THE Web_UI SHALL hỗ trợ phím tắt: `Ctrl+N` tạo profile mới, `Ctrl+F` focus vào search box, `Delete` xóa profile đang chọn (có confirm dialog).
2. THE Web_UI SHALL hỗ trợ `Enter` để mở/start profile đang được highlight trong danh sách.
3. THE Web_UI SHALL hỗ trợ `Escape` để đóng modal/drawer đang mở.
4. THE Web_UI SHALL hiển thị danh sách phím tắt khi user nhấn `?` hoặc `Ctrl+/`.
5. THE Web_UI SHALL hỗ trợ điều hướng danh sách Profile bằng phím mũi tên lên/xuống.
