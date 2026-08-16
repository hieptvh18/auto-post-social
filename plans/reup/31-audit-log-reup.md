# Plan 31 — Audit log cho reup (cron + thao tác), chỉ SUPER_ADMIN thấy

**Milestone:** M12 · **Trạng thái:** ⬜ chưa làm
**Phụ thuộc:** [30-reup-cleanup.md](./30-reup-cleanup.md) **phải nghiệm thu xong**
(cần đủ mọi loại sự kiện reup để có cái mà ghi log)
**Spec tham chiếu:** `docs/05-rbac.md` §8 (audit log) — **plan này có thể phải sửa docs, hỏi user trước**
**Bản đồ:** [README.md](./README.md)

---

## 1. Mục tiêu

Sau plan 29-30, cron reup chạy ngầm mỗi ngày: quét chủ đề, tải video, đẩy Drive, xoá
file. Toàn bộ chuỗi này hôm nay **không để lại dấu vết nào ở màn `/audit`** — hỏng thì
không truy được ai/cái gì gây ra, và "hôm qua tự nhiên mất 3 video" không có chỗ tra.

Sau plan này: mọi sự kiện reup có mặt ở màn **Audit Logs** với nhóm action riêng, lọc
được theo nhóm — và **chỉ SUPER_ADMIN nhìn thấy**. Role khác vào cùng màn `/audit` thì
các dòng log reup **không tồn tại** với họ: không trong bảng, không trong dropdown lọc,
không qua API.

## 2. Ngoài phạm vi

- **Không** đổi cấu trúc bảng `audit_logs`. `action` là `String` tự do ⇒ thêm action mới
  **không cần migration** (đã kiểm chứng: `schema.prisma:457`).
- **Không** làm export CSV / biểu đồ thống kê log.
- **Không** làm retention/xoá log cũ — bảng `audit_logs` to dần là vấn đề khác, ghi nợ
  vào `contexts.md` §6 nếu thấy nặng.
- **Không** ghi log cho từng bước nhỏ của queue (mỗi lần đổi status của `reup_videos`).
  Chỉ ghi **sự kiện có ý nghĩa nghiệp vụ** (§3.1) — log rác làm màn audit vô dụng.
- **Không** thay `reup_runs` bằng audit log. Hai thứ khác nhau: `reup_runs` là nhật ký
  kỹ thuật của cron (có claim, quota, skip reason), audit log là dấu vết **ai làm gì**.

## 3. Thiết kế

### 3.1 Action mới — thêm vào `AuditAction` ở `audit.service.ts`

Tất cả dùng **tiền tố `REUP_`** — đây là điều kiện để lọc RBAC ở §3.2 hoạt động.

| Action | Khi nào ghi | `userId` | `resource` |
|---|---|---|---|
| `REUP_TOPIC_CREATE` | tạo chủ đề | người bấm | `reup_topic:<id>` |
| `REUP_TOPIC_UPDATE` | sửa chủ đề (gồm bật/tắt, đổi `autoApprove`) | người bấm | `reup_topic:<id>` |
| `REUP_TOPIC_DELETE` | soft delete chủ đề | người bấm | `reup_topic:<id>` |
| `REUP_DISCOVER_CRON` | **cron A chạy xong 1 chủ đề** — 1 dòng/chủ đề/ngày | `null` (Bot) | `reup_topic:<id>` |
| `REUP_DISCOVER_MANUAL` | bấm "Quét ngay" | người bấm | `reup_topic:<id>` |
| `REUP_VIDEO_IMPORTED` | video vào kho thành công | `null` (Bot) | `reup_video:<id>` |
| `REUP_VIDEO_FAILED` | tải/upload hỏng, hết lượt retry | `null` (Bot) | `reup_video:<id>` |
| `REUP_VIDEO_RETRY` | bấm "Thử lại" | người bấm | `reup_video:<id>` |
| `REUP_VIDEO_SKIP` | bấm "Bỏ qua" | người bấm | `reup_video:<id>` |
| `REUP_CLEANUP_CRON` | cron dọn dẹp chạy xong — **1 dòng cho cả lô** | `null` (Bot) | `reup_cleanup:<YYYY-MM-DD>` |
| `REUP_CLEANUP_MANUAL` | bấm "Dọn ngay" | người bấm | `reup_cleanup:<YYYY-MM-DD>` |
| `REUP_RESOURCE_DELETE` | xoá file của **một** bài bằng tay | người bấm | `content_asset:<id>` |

**`afterValue`** giữ số liệu tóm tắt để đọc log là hiểu ngay, không phải mở 3 màn khác:

```jsonc
// REUP_DISCOVER_CRON
{ "topicName": "Mẹo nấu ăn", "platform": "YOUTUBE", "status": "DONE",
  "foundCount": 42, "pickedCount": 3, "skipReason": null, "quotaUsed": 100 }

// REUP_VIDEO_IMPORTED
{ "title": "...", "sourceUrl": "...", "authorName": "...",
  "contentAssetId": "...", "fileSize": 12345678, "autoApproved": true }

// REUP_CLEANUP_CRON  — 1 dòng cả lô, KHÔNG 20 dòng lẻ
{ "deletedCount": 12, "freedBytes": 987654321, "retentionDays": 7 }
```

Quy tắc **1 dòng cho cả lô** ở cleanup mượn đúng khuôn `CONTENT_BULK_DELETE` đã có
(plan 19) — xoá 20 file mà ghi 20 dòng thì màn audit ngập rác trong một tuần.

`REUP_CLEANUP_CRON` chỉ ghi khi `deletedCount > 0`. Cron chạy không xoá gì ⇒ **không
ghi log** (mỗi ngày một dòng "đã xoá 0 bài" là rác thuần tuý).

### 3.2 RBAC — cùng luật với plan 27, nhưng có một rò rỉ riêng

Luật: **chỉ user có `reup:view` mới thấy log có `action` bắt đầu bằng `REUP_`.**

Chặn ở `AuditService`, **không** ở controller và **không** ở FE:

```text
AuditService.findMany(filter, paging, currentUser):
  nếu user KHÔNG có 'reup:view':
      thêm điều kiện: action NOT LIKE 'REUP_%'
      và nếu client truyền filter.action bắt đầu bằng 'REUP_'
         ⇒ trả rỗng (không ném 403 — 403 xác nhận nhóm log đó tồn tại)
```

#### Làm rõ: "trả rỗng" là hàng rào sau, không phải trải nghiệm của ADMIN

Chốt với user 2026-08-15: **ADMIN không nhìn thấy option reup nào trong dropdown lọc.**
Dropdown "Loại thao tác" vẫn còn nguyên và ADMIN vẫn lọc log thường được như hôm nay —
chỉ là danh sách option không có mục REUP (đó chính là §3.2 `distinctActions`, C9).

⇒ Trên UI, ADMIN **không có cách nào** chọn được action reup để mà lọc.

Nhánh "trả rỗng" chỉ áp dụng khi ai đó **gọi thẳng API** với `?action=REUP_...`
(Swagger, curl, sửa URL). Đó là hàng rào phòng thủ tầng service, không phải hành vi
người dùng gặp trên màn hình. Hai thứ này phải cùng tồn tại:

| Đường vào | Hành vi với ADMIN |
|---|---|
| Dropdown trên UI | **Không có** option reup để chọn (C9) |
| Gọi thẳng API `?action=REUP_*` | Trả **rỗng**, không 403 |
| Không truyền filter | Danh sách log **không lẫn** dòng reup nào |

#### Rò rỉ riêng của màn này — `distinctActions()`

`AuditRepository.distinctActions()` đổ dropdown lọc **từ dữ liệu thật trong DB**
(`audit.repository.ts:61`, comment gốc: *"UI đổ select từ đây thay vì hardcode lại"*).

⇒ Không lọc hàm này thì ADMIN mở màn `/audit` sẽ **thấy `REUP_DISCOVER_CRON`,
`REUP_CLEANUP_CRON`… nằm trong dropdown** dù bấm vào không ra record nào. Tên action
tự nó đã tiết lộ hệ thống đang tự động tải video reup — đúng thứ bạn muốn giấu.

Bắt buộc: `distinctActions(currentUser)` cũng lọc `REUP_%` khi thiếu quyền.

Đây là **cạm bẫy C9**, ghi vào README.

### 3.3 Frontend

- `AuditLogsPage.tsx`: không phải sửa logic lọc — backend đã lọc sạch, dropdown tự đúng.
- Thêm nhãn tiếng Việt cho 12 action mới vào `ACTION_LABELS`
  (vd `REUP_DISCOVER_CRON` → *"Quét video reup (tự động)"*, `REUP_CLEANUP_CRON` →
  *"Dọn file reup (tự động)"*).
- Modal chi tiết: render `afterValue` của action reup thành bảng đọc được (số video
  tìm được/chọn, dung lượng giải phóng), không dump JSON thô.
- Cột "Người thực hiện" đã xử lý `user = null` ⇒ hiện **Bot/Hệ thống**. Kiểm chứng lại
  chỗ này khi code — cron reup luôn `userId = null`.

## 4. Task

**Backend**
- [ ] `audit.service.ts`: thêm 12 action `REUP_*` vào `AuditAction` (§3.1)
- [ ] `AuditService.findMany`: thiếu `reup:view` ⇒ loại `action LIKE 'REUP_%'`;
      client truyền `filter.action = REUP_*` ⇒ trả rỗng (§3.2)
- [ ] `AuditRepository`: hỗ trợ điều kiện loại trừ tiền tố action
- [ ] **`AuditService.findActions`: lọc `REUP_%` khi thiếu quyền** (C9, §3.2)
- [ ] `reup-topics.service.ts`: ghi log CREATE/UPDATE/DELETE + DISCOVER_MANUAL
- [ ] `reup-discovery.scheduler.ts`: ghi `REUP_DISCOVER_CRON` mỗi chủ đề, `userId = null`
- [ ] `reup-download.processor.ts`: ghi `REUP_VIDEO_IMPORTED` / `REUP_VIDEO_FAILED`
- [ ] `reup-cleanup.service.ts`: ghi `REUP_CLEANUP_CRON` **1 dòng cả lô**, chỉ khi
      `deletedCount > 0`; `REUP_RESOURCE_DELETE` cho xoá lẻ
- [ ] Endpoint retry/skip video: ghi `REUP_VIDEO_RETRY` / `REUP_VIDEO_SKIP`
- [ ] Kiểm: `afterValue` **không** chứa API key / token (rule 01 §Bảo mật)

**Frontend**
- [ ] `ACTION_LABELS`: 12 nhãn tiếng Việt
- [ ] Modal chi tiết: render `afterValue` reup thành bảng, không JSON thô

**Test bắt buộc** (RBAC = vùng bắt buộc, rule 02)
- [ ] ADMIN `findMany` **không** trả dòng nào có action `REUP_*`
- [ ] ADMIN truyền `filter.action = 'REUP_DISCOVER_CRON'` ⇒ **rỗng**, không 403
- [ ] ADMIN `findActions()` ⇒ danh sách **không chứa** action `REUP_*` (C9)
- [ ] SUPER_ADMIN `findMany` ⇒ thấy đủ log reup · `findActions()` ⇒ có action reup
- [ ] Log cũ (action không phải `REUP_*`) ADMIN vẫn thấy đủ — **chống hồi quy**
- [ ] Cleanup xoá 5 bài ⇒ **đúng 1** dòng audit, `deletedCount = 5`
- [ ] Cleanup xoá 0 bài ⇒ **không** ghi dòng nào
- [ ] Cron ghi log với `userId = null` (actor Bot)
- [ ] `afterValue` không chứa chuỗi API key (assert trên payload)

**Chốt**
- [ ] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh
- [ ] `.env.example`: không đổi
- [ ] Hỏi user rồi cập nhật `docs/05-rbac.md` §8 nếu cần (rule 00 §1)
- [ ] `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

- [ ] SUPER_ADMIN bấm "Quét ngay" ⇒ `/audit` có dòng `REUP_DISCOVER_MANUAL` kèm tên
      chủ đề, số video tìm được/chọn
- [ ] Đợi cron 02:00 (hoặc chỉnh giờ test) ⇒ có dòng `REUP_DISCOVER_CRON`, cột Người
      thực hiện hiện **Bot/Hệ thống**
- [ ] Video import xong ⇒ có `REUP_VIDEO_IMPORTED` kèm link nguồn + tên bài trong kho
- [ ] Chạy cleanup xoá nhiều bài ⇒ **đúng 1 dòng** `REUP_CLEANUP_CRON`, mở ra thấy số
      bài + dung lượng giải phóng
- [ ] **Đăng nhập ADMIN** vào `/audit`:
      - bảng **không có** dòng reup nào
      - dropdown lọc action **không có** mục nào bắt đầu bằng "Reup" (C9)
      - log cũ (user, content, page, autopost…) vẫn **hiện đầy đủ như trước**
- [ ] ADMIN gọi thẳng `GET /audit?action=REUP_DISCOVER_CRON` bằng Swagger ⇒ danh sách
      **rỗng**, không phải 403 và không lộ tổng số
- [ ] `grep` log/response ⇒ **không** có API key YouTube trong `afterValue`

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Quên lọc `distinctActions()` ⇒ ADMIN thấy tên action reup trong dropdown, lộ sự tồn tại của tính năng (C9) | Task riêng + test riêng + bước nghiệm thu riêng cho dropdown |
| R2 | Lọc bằng `action != 'REUP_...'` liệt kê tay ⇒ thêm action mới là quên lọc | Lọc bằng **tiền tố** `REUP_%`, không liệt kê; đặt quy ước tiền tố ở §3.1 |
| R3 | Ghi log mỗi bước queue ⇒ màn audit ngập rác, log thật bị chôn | Chỉ 12 action §3.1; cleanup 1 dòng/lô; cron 0 kết quả không ghi |
| R4 | Ném 403 khi ADMIN lọc action reup ⇒ xác nhận nhóm log đó tồn tại | Trả **rỗng**, không 403 (cùng lý lẽ 404 ở plan 27 §3.2) |
| R5 | Lỗi ghi audit làm hỏng cron reup | `AuditService.log()` đã nuốt lỗi sẵn (`audit.service.ts`) — **không** bọc thêm try/catch tự chế, dùng đúng hàm đó |
| R6 | `afterValue` chứa URL có API key (nếu lỡ log nguyên request) | Chỉ ghi field liệt kê ở §3.1; test assert payload sạch |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:** N test
- **Còn nợ:**
