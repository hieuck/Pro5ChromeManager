# Learning — Cơ chế tự tiến hóa

> Agent không chỉ thực thi — agent học từ mỗi lần làm và tự nâng cấp hệ thống của chính mình.
> File này là "não" tích lũy theo thời gian. Càng làm nhiều, agent càng giỏi hơn.

---

## Vòng lặp học tập (chạy sau MỌI task hoàn thành hoặc incident)

```
Làm → Quan sát kết quả → Phân tích → Rút pattern → Ghi nhớ → Cập nhật hệ thống → Làm lại tốt hơn
```

### Sau mỗi task hoàn thành — tự hỏi:
1. **Cái gì đã hoạt động tốt?** → Ghi vào "Patterns thành công" bên dưới
2. **Cái gì mất thời gian hơn dự kiến?** → Tìm nguyên nhân gốc rễ
3. **Có bước nào có thể tự động hóa không?** → Tạo hook mới nếu có
4. **Steering file nào cần cập nhật để lần sau không phải suy nghĩ lại?** → Cập nhật ngay

### Sau mỗi lần bị kẹt / thất bại — tự hỏi:
1. **Thiếu thông tin gì?** → Thêm vào steering file tương ứng
2. **Quyết định nào đã sai?** → Ghi vào "Bài học từ thất bại" bên dưới
3. **Hệ thống (hooks/steering) có góp phần gây ra vấn đề không?** → Fix hệ thống, không chỉ fix code
4. **Nếu gặp lại tình huống này, làm khác đi thế nào?** → Ghi thành rule mới

---

## Cách tự nâng cấp hệ thống

Agent được phép và **có trách nhiệm** tự sửa đổi:

| Phát hiện | Hành động |
|-----------|-----------|
| Pattern lặp lại > 2 lần | Tạo hook tự động hóa |
| Quyết định phải suy nghĩ lại | Thêm vào steering file tương ứng |
| Bug cùng loại xuất hiện lần 2 | Thêm vào `memory.md` + viết test cover case đó |
| Task mất > 2x thời gian dự kiến | Break down thành sub-tasks nhỏ hơn trong `tasks.md` |
| Thiếu domain knowledge | Tạo steering file mới cho domain đó |
| Hook gây friction | Sửa hoặc disable hook đó |
| Workaround được dùng > 1 lần | Biến workaround thành solution chính thức |

---

## Patterns thành công (tích lũy theo thời gian)

> Mỗi khi tìm ra cách làm hiệu quả, ghi vào đây. Đây là "kinh nghiệm" của agent.

### Testing
- Inject dependency thay vì mock fs trực tiếp → testable hơn, ít brittle hơn (học từ RuntimeManager)
- Wrap `vi.restoreAllMocks()` trong block `{}` để tránh TS error về return type

### Architecture
- Singleton managers export named, instantiate trong `index.ts` → consistent, dễ test
- WebSocket attach vào HTTP server hiện có → không cần port riêng, đơn giản hơn

### Debugging
- Khi TypeScript error mơ hồ: chạy `tsc --noEmit 2>&1 | head -50` để xem full error context
- Khi test fail không rõ lý do: thêm `console.log` tạm thời, chạy test đơn lẻ với `vitest run --reporter=verbose`

---

## Bài học từ thất bại (tích lũy theo thời gian)

> Mỗi lần thất bại là dữ liệu. Ghi lại để không lặp lại.

| Ngày | Tình huống | Sai ở đâu | Làm đúng là |
|------|-----------|-----------|-------------|
| 2026-03-22 | `vi.spyOn(fs, 'access')` fail | `fs/promises.access` là non-configurable | Inject `accessFn` vào constructor |
| 2026-03-22 | `afterEach` TS error | `vi.restoreAllMocks()` trả về `VitestUtils` | Wrap trong `{ }` block |

---

## Skill inventory — Những gì agent đã thành thạo

> Track để biết mình đang ở đâu, thiếu gì.

### Thành thạo ✅
- TypeScript strict mode, Zod validation
- Express REST API với error handling chuẩn
- Vitest unit testing, dependency injection pattern
- AES-256-GCM encryption/decryption
- WebSocket server + client với reconnect
- Chromium process management (spawn, CDP, health check)
- GitHub Actions CI/CD pipeline

### Đang học / cần cải thiện 🔄
- React + Ant Design UI (Task 12/13/14 chưa xong)
- Electron desktop packaging
- electron-updater auto-update flow

### Chưa có kinh nghiệm ❌
- Code signing Windows installer
- SQLite migration (nếu cần chuyển từ JSON)

---

## Meta-learning — Học cách học tốt hơn

> Những insight về bản thân quá trình học của agent.

### Khi nào nên web search vs tự suy luận?
- API/library mới, version cụ thể → web search trước
- Pattern đã biết trong codebase → đọc code hiện có trước
- Business logic, pricing, competitor → web search trước (Reddit, GitHub, ProductHunt, G2)
- Quyết định market/product → research trước, không hỏi user

### Khi nào nên tạo steering file mới?
- Khi phải suy nghĩ > 30 giây về một quyết định → quyết định đó nên được document
- Khi cùng một câu hỏi xuất hiện lần 2 → đã đến lúc viết thành rule

### Khi nào nên tạo hook mới?
- Khi cùng một sequence of actions lặp lại sau một event cụ thể
- Khi phát hiện mình "quên" làm một bước quan trọng sau khi hoàn thành task

### Dấu hiệu hệ thống đang hoạt động tốt
- Agent ít phải hỏi lại steering files cho cùng một loại quyết định
- Số lần bị kẹt giảm dần theo thời gian
- Tasks hoàn thành nhanh hơn mà không giảm chất lượng
- `memory.md` ngày càng dày hơn với patterns hữu ích

### Dấu hiệu hệ thống cần được cải thiện
- Cùng một loại lỗi xuất hiện lần 2
- Agent phải đọc nhiều steering files để trả lời một câu hỏi đơn giản
- Hook trigger sai thời điểm hoặc gây friction
- `agent-errors.log` có entries mới

---

## Nguyên tắc tiến hóa

1. **Mỗi thất bại là dữ liệu, không phải thảm họa** — ghi lại, học, tiếp tục
2. **Hệ thống phải tự cải thiện** — nếu cùng một vấn đề xảy ra lần 2, đó là lỗi của hệ thống, không phải của task
3. **Đơn giản hóa theo thời gian** — nếu steering file ngày càng phức tạp, có gì đó đang sai
4. **Tự động hóa những gì lặp lại** — nếu làm tay > 2 lần, tạo hook
5. **Document quyết định, không chỉ kết quả** — "tại sao" quan trọng hơn "cái gì"
