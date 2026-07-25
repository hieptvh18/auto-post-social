# Plan 12 — Lịch đăng bài (tracking lịch + tiến độ auto-post của mọi page)

**Milestone:** thuộc M6 nhưng **làm trước engine** (chốt với user 2026-07-25)
**Trạng thái:** 🟡
**Phụ thuộc:** Plan 06 (slot CRUD), Plan 09 (manual-post ghi `publish_jobs`)
**Spec liên quan:** `docs/02-architecture.md` §5.3, `docs/03-database-design.md` §7

---

## 1. Mục tiêu

Trang **"Lịch đăng bài"** (`/timeline`) hiện đang chạy mock. Biến nó thành màn
**tracking lịch đăng + tiến độ đăng tự động của tất cả page**, dữ liệu **map từ
"Cài đặt đăng bài tự động"**:

- Mỗi mốc giờ (`auto_post_slots`) của mỗi page = một **ô lịch** trong ngày đang xem.
- Ô lịch cho biết: đăng ở page nào, giờ nào, dạng bài nào, loại media, **kế hoạch
  bao nhiêu bài** (`postCount`), **đã đăng được bao nhiêu** (từ `publish_jobs`),
  **còn bao nhiêu bài trong kho** dùng được cho mốc đó.
- Bài đăng tay (plan 09, `created_by != 'Bot'`) hiện thành ô riêng, không lẫn vào
  lịch tự động.

Đây là màn **chỉ đọc**. Không tạo/sửa slot ở đây (đã có `/auto-post`).

## 2. Ngoài phạm vi

- Không làm cron/queue/publisher — vẫn là plan 07. Vì engine chưa có, hôm nay ô lịch
  của slot tương lai luôn ở trạng thái "Chờ tới giờ", và job thực tế chỉ đến từ đăng tay.
  Khi plan 07 xong, trang này **không cần sửa** — job tự động cùng đổ vào `publish_jobs`.
- Không retry/cancel job qua UI (ngoài scope MVP).
- Không xem lịch theo tuần/tháng — chỉ theo **ngày**.

## 3. Thiết kế

### 3.1 Backend — module `publish-schedule`

Một endpoint duy nhất:

```text
GET /publish-schedule?date=YYYY-MM-DD&pageId=<uuid>&status=<PublishStatus>
     permission: timeline:view (ADMIN + EDITOR)
```

`date` hiểu theo **Asia/Ho_Chi_Minh** (mặc định = hôm nay theo giờ VN). Khoảng
truy vấn job = `[date 00:00 VN, date+1 00:00 VN)` quy đổi sang UTC.

Response:

```ts
{
  date: 'YYYY-MM-DD',
  timezone: 'Asia/Ho_Chi_Minh',
  summary: { plannedPosts, activeSlots, pagesAutoOn, successPosts, failedPosts,
             runningPosts, manualPosts },
  items: ScheduleItem[]   // sắp theo time ASC, cùng giờ thì theo tên page
}
```

`ScheduleItem` = một mốc giờ của một page trong ngày:

```ts
{
  key, kind: 'slot' | 'manual', time: 'HH:mm',
  slotId, pageId, facebookPageId, pageName,
  pageIsActive, autopostEnabled, slotEnabled,
  categories, mediaType, plannedCount, readyCount,
  progress, jobs: ScheduleJob[]
}
```

`progress` — hàm **thuần** `resolveSlotProgress()` (file riêng, có test):

| Giá trị | Điều kiện |
|---------|-----------|
| `PAUSED` | page tạm dừng / page tắt auto / slot tắt |
| `FAILED` | có job FAILED và **không** có job SUCCESS |
| `DONE` | `success >= plannedCount` |
| `RUNNING` | có job SCHEDULED/QUEUED/PUBLISHING |
| `PARTIAL` | `0 < success < plannedCount` và không còn job đang chạy |
| `MISSED` | chưa có job nào, mốc giờ đã qua |
| `NO_CONTENT` | chưa tới giờ (hoặc hôm nay) nhưng `readyCount = 0` ⇒ tới giờ cũng không có bài |
| `PENDING` | còn lại — chờ tới giờ |

`slotPassed` tính từ `ClockService.now()` (inject để test không phụ thuộc giờ thật):
ngày quá khứ ⇒ luôn qua; ngày tương lai ⇒ chưa qua; hôm nay ⇒ so `HH:mm`.

### 3.2 Map job vào slot

Job của Bot (`createdBy === 'Bot'`) ghép vào slot khi **cùng page** và `HH:mm` của
`scheduleTime` (giờ VN) **trùng `slot.time`**. Job không khớp slot nào và job đăng tay
gom thành item `kind: 'manual'` theo (page, `HH:mm`).

Lý do không thêm cột `slot_id` vào `publish_jobs`: **không đổi schema** ⇒ `erd.md`
giữ nguyên; slot có thể bị xoá/đổi giờ sau khi đăng, khi đó FK cũng vô nghĩa.
Ghi nợ: nếu sau này 2 slot cùng page trùng giờ thì ghép nhầm — nhưng plan 06 đã
chặn trùng giờ trong cùng page (409).

### 3.3 `readyCount` — kho bài còn dùng được cho slot

Đếm `content_page_assignments` của page đó, `published_at IS NULL`, content
`status = APPROVED`, `category IN slot.categories`, media khớp (`all` ⇒ bỏ điều kiện).
Đây là **điều kiện cần** của picker (plan 07 §3.2) trừ mệnh đề "chưa có job
QUEUED/PUBLISHING" — cố ý không nhân bản toàn bộ picker để 2 nơi không trôi khỏi nhau;
số này chỉ để cảnh báo "hết bài", không quyết định đăng gì.

### 3.4 Frontend

- `src/api/publishSchedule.api.ts` + `src/hooks/usePublishSchedule.ts`
  (refetch mỗi 30s để thấy job đổi trạng thái).
- `TimelinePage`: tách `RealTimelinePage` (API thật) / `MockTimelinePage` (giữ mock cũ)
  theo `env.useMock` — cùng pattern plan 04/05/06.
- Layout: hàng thống kê (kế hoạch / đã đăng / đang chạy / lỗi) + bộ lọc (ngày, page,
  trạng thái) + danh sách ô lịch nhóm theo giờ.
- Mỗi job trong ô lịch có link **"Xem/sửa bài trong kho"** → `/content?edit=<contentAssetId>`.
  `RealContentManagementPage` đọc param `edit`, gọi `useContentAsset(id)` (bài có thể không
  nằm trong trang danh sách đang xem) rồi mở luôn Drawer sửa và **xoá param** ngay để đóng
  Drawer + F5 không bị mở lại. Id không tồn tại ⇒ toast "không tìm thấy bài".

## 4. Task

- [x] `ClockService` + `ClockModule` (`src/infra/clock/`) — dùng lại cho plan 07
- [x] `schedule-progress.ts` — `resolveSlotProgress` (hàm thuần)
- [x] `publish-schedule.repository.ts` — slot theo page, job trong ngày, `countReadyForSlot`
- [x] `publish-schedule.service.ts` — build items + summary, filter page/status
- [x] `publish-schedule.controller.ts` + `dto/query-publish-schedule.dto.ts`
- [x] Đăng ký module vào `app.module.ts`
- [x] Unit test: `resolveSlotProgress` đủ 8 nhánh + service (map job↔slot, filter,
      summary, manual item, ngày mặc định)
- [x] `npm run lint && npm run test && npm run build` xanh
- [x] FE: types + api + hook + `TimelinePage` bản Real
- [x] FE: link từ mỗi job sang `/content?edit=<id>` + deep-link mở Drawer ở
      `ContentManagementPage` (hook mới `useContentAsset`)
- [x] FE: `npm run lint && npm run build` xanh
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] Không đụng schema ⇒ `erd.md` không đổi
- [x] `GET /publish-schedule` trả đúng số slot × page cho ngày hôm nay
- [x] Page tắt auto / slot tắt ⇒ `progress = PAUSED`
- [x] Bài đăng tay hôm nay hiện thành item `kind = manual`
- [x] CONTENT gọi endpoint ⇒ 403
- [ ] Smoke UI thật `/timeline` (chưa làm — xem contexts §6)

## 6. Rủi ro

| Rủi ro | Xử lý |
|--------|-------|
| Lệch timezone giữa slot `'HH:mm'` (VN) và `schedule_time` (UTC) | Mọi quy đổi qua `dayjs.tz` + hằng `TIMEZONE`; test đặt job UTC lệch ngày để bắt lỗi |
| `readyCount` chạy N query (1/slot) | MVP vài page × vài slot; nếu chậm thì gộp thành 1 groupBy — ghi nợ |
| Ghép job↔slot theo giờ có thể sai nếu sau này bỏ ràng buộc trùng giờ | Ghi nợ ở §3.2 |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-25 (code + test; chờ smoke UI)
- **File chính:** `backend/src/modules/publish-schedule/**`, `backend/src/infra/clock/`,
  `frontend/src/api/publishSchedule.api.ts`, `frontend/src/hooks/usePublishSchedule.ts`,
  `frontend/src/pages/TimelinePage.tsx`, `frontend/src/pages/ContentManagementPage.tsx`
  (deep-link `?edit=<id>`), `frontend/src/hooks/useContentAssets.ts` (`useContentAsset`)
- **Khác thiết kế ban đầu:** không có
- **Test:** xem contexts §5
- **Còn nợ:** smoke UI thật; job tự động chỉ xuất hiện sau plan 07
