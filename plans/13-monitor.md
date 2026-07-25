# Plan 13 — Monitor: Queue Monitor · Failed Jobs · Audit Logs

**Milestone:** M8 (Phase 2, sau khi MVP đóng 2026-07-25)
**Trạng thái:** ✅ xong 2026-07-25
**Phụ thuộc:** Plan 07 (`publish_jobs`, `publish_job_events`, BullMQ), Plan 02 (`audit_logs`)
**Spec tham chiếu:** `docs/05-rbac.md` §2 (quyền `queue:view` / `jobs:retry` / `audit:view`),
`docs/08-*` (vòng đời publish job), `plans/DONE/07-autopost-engine.md` §4.3 (log 2 tầng)

---

## 1. Mục tiêu

Cho ADMIN một chỗ **nhìn được hệ thống đang chạy gì và hỏng ở đâu** mà không phải mở
DB hay đọc log terminal. Ba màn dưới nhóm menu **Monitor**:

| Màn | Câu hỏi nó trả lời |
|-----|--------------------|
| **Queue Monitor** | Ngay lúc này BullMQ đang có bao nhiêu job chờ/đang chạy? Có job nào kẹt không? |
| **Failed Jobs** | Bài nào đăng hỏng, hỏng vì lý do gì, đăng lại được không? |
| **Audit Logs** | Ai đã làm gì, lúc nào, đổi giá trị từ đâu sang đâu? |

Khác `/timeline` (đã có): Timeline nhìn theo **lịch của một ngày** (slot × page), Monitor
nhìn theo **sức khoẻ hệ thống** xuyên ngày và không gắn với slot.

## 2. Ngoài phạm vi

- Không làm dashboard biểu đồ/thống kê theo thời gian (vẫn ngoài scope, PLAN-MVP §3).
- Không thêm nút **pause/resume/drain queue** hay xoá job khỏi Redis từ UI — nguy hiểm,
  chỉ đọc + retry.
- Không làm realtime WebSocket/SSE — dùng **polling react-query** (`refetchInterval`).
- Không làm reconciliation cron cho job kẹt `PUBLISHING` (vẫn ngoài scope) — màn Queue
  chỉ **cảnh báo** job kẹt, không tự sửa.
- Không xoá / archive audit log từ UI.
- Không đụng `schema.prisma`: **plan này không có migration**, do đó `erd.md` không đổi.
  Nếu phát sinh nhu cầu đổi schema ⇒ dừng, ghi lại lý do, cập nhật `erd.md` theo rule 05.

## 3. Thiết kế

### 3.1 Bức tranh chung

```text
Queue Monitor  ──▶ GET /monitor/queue/summary   (BullMQ counts + đếm DB theo status)
                └▶ GET /publish-jobs?status=... (mở rộng: phân trang + không bắt buộc date)
Failed Jobs    ──▶ GET /publish-jobs?status=FAILED&page=..   (dùng lại endpoint trên)
                └▶ POST /publish-jobs/:id/retry               (ĐÃ CÓ từ plan 07)
                └▶ GET /publish-jobs/:id/events               (ĐÃ CÓ từ plan 07)
Audit Logs     ──▶ GET /audit-logs?…  (MỚI — module audit hiện chỉ có ghi, chưa có đọc)
```

Nguyên tắc: **không đẻ endpoint trùng chức năng**. Failed Jobs không có API riêng, nó là
`/publish-jobs` với filter — chỉ mở rộng DTO query sẵn có.

### 3.2 Backend — việc phải làm

**a) Mở rộng `GET /publish-jobs` (module `publish-jobs`)**

Hiện `QueryPublishJobsDto` chỉ có `date`, `pageId`, `status` và trả về **mảng trần
không phân trang** — Monitor nhìn xuyên ngày nên bắt buộc phải phân trang.

- Thêm vào DTO: `page` (mặc định 1, min 1), `pageSize` (mặc định 20, max 100),
  `from` / `to` (ngày `DD-MM-YYYY`, quy đổi UTC bằng `dayRangeUtc` như `date`),
  `search` (khớp tiêu đề content — optional, làm sau nếu tốn thời gian).
- Response đổi thành `{ items, total, page, pageSize }`.
  **Đã kiểm: FE hiện chưa gọi endpoint list này** (`/timeline` dùng `/publish-schedule`,
  chỉ mượn `/publish-jobs/:id/events` và `/:id/retry` qua `publishSchedule.api.ts`)
  ⇒ đổi shape response **không gãy màn nào**. Vẫn phải chạy lại test BE của controller.
- Repository thêm `countMany(filter)` dùng chung filter với `findMany`, tránh 2 nơi
  viết điều kiện lệch nhau.
- Giữ nguyên `@RequirePermission('timeline:view')` ở controller hiện tại.

**b) Module mới `modules/monitor/` — chỉ đọc**

```text
src/modules/monitor/
├── monitor.module.ts
├── monitor.controller.ts        # @RequirePermission('queue:view')
├── monitor.service.ts
└── __tests__/monitor.service.spec.ts
```

`GET /monitor/queue/summary` trả:

```jsonc
{
  "queue": { "waiting": 3, "active": 1, "delayed": 2, "failed": 5, "completed": 120 },
  "db": { "scheduled": 0, "queued": 3, "publishing": 1, "failed": 5, "success": 120 },
  "stuck": [ { "id": "...", "contentTitle": "...", "pageName": "...",
               "status": "PUBLISHING", "stuckMinutes": 47 } ],
  "queueHealthy": true,
  "checkedAt": "2026-07-25T10:00:00.000Z"
}
```

- `queue.*` lấy từ `Queue.getJobCounts()` của BullMQ (inject queue `publish-facebook`
  qua `@InjectQueue`, hằng tên đã có ở `publish-queue.constants.ts`).
- `db.*` lấy bằng `groupBy(status)` trên `publish_jobs` — **để đối chiếu**: Redis và DB
  lệch nhau là dấu hiệu Redis bị flush hoặc worker chết.
- `stuck` = job `PUBLISHING` quá `MONITOR_STUCK_MINUTES` (env, mặc định 15) tính từ
  `updatedAt`. Đây là cách phát hiện worker chết giữa chừng khi chưa có reconciliation cron.
- `queueHealthy=false` khi Redis không kết nối được ⇒ **không ném 500**, trả
  `queue: null` + `queueError` để UI vẫn hiển thị phần DB. Màn monitor mà sập vì thứ nó
  đang giám sát thì vô nghĩa.

**c) `GET /audit-logs` (mở rộng module `audit` sẵn có)**

Module `audit` hiện **chỉ có `AuditService.log()` + repository ghi** — phải thêm đường đọc:

- `audit.repository.ts`: thêm `findMany(filter, paging)` + `countMany(filter)`,
  `include: { user: { select: { id, name, email, role } } }`, sắp `created_at DESC`.
- `audit.service.ts`: thêm `findMany()` (chỉ delegate — theo rule 02 không cần test riêng).
- `audit-http.module.ts` + `audit.controller.ts`: `@RequirePermission('audit:view')`
  (chỉ ADMIN). **Lưu ý cạm bẫy đã gặp** (`contexts.md` §7 — vụ `SettingsModule`):
  `AuditModule` đang được rất nhiều module import để ghi log; **không** thêm controller
  vào chính `AuditModule` mà tách `AuditHttpModule` riêng, tránh vòng phụ thuộc.
- Query: `action`, `userId`, `resource` (khớp prefix), `from`, `to`, `page`, `pageSize`.
- `GET /audit-logs/actions` trả danh sách action đang có trong DB (`distinct`) để UI đổ
  select — không hardcode lại danh sách `AuditAction` ở FE.
- **Mapper bắt buộc lọc secret**: `beforeValue`/`afterValue` là JSONB tự do, đã từng chứa
  key nhạy cảm (`PAGE_TOKEN_UPDATE`, `SETTINGS_UPDATE`). Viết `sanitizeAuditValue()` bỏ mọi
  key khớp `token|password|secret|accessToken|clientSecret|refreshToken|serviceAccount`
  (thay bằng `'***'`), dùng lại tinh thần `sanitizeRawError` của plan 07.
  **Đây là logic dễ sai + hậu quả nặng ⇒ bắt buộc có unit test** (rule 02).

**d) Env mới**

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `MONITOR_STUCK_MINUTES` | `15` | Job `PUBLISHING` lâu hơn ngần này phút ⇒ coi là kẹt |

Thêm vào `backend/.env.example` **cùng commit** (rule 04) + `env.validation.ts` (optional, int ≥ 1).

### 3.3 Frontend — việc phải làm

Ba trang **đã tồn tại dưới dạng mock** (`QueueMonitorPage.tsx`, `FailedJobsPage.tsx`,
`AuditLogsPage.tsx`, route `/queue`, `/failed`, `/audit` đã khai trong `App.tsx`) — việc
của plan này là **thay mock bằng API thật**, không dựng lại từ đầu. Giữ nhánh
`VITE_USE_MOCK` theo ADR-005.

| File | Việc |
|------|------|
| `src/api/monitor.api.ts` | **mới** — `getQueueSummary()` |
| `src/api/audit.api.ts` | **mới** — `getAuditLogs(query)`, `getAuditActions()` |
| `src/api/publishJobs.api.ts` | **mới** — `getPublishJobs(query)` phân trang; dời `getJobEvents`/`retryJob` từ `publishSchedule.api.ts` sang đây cho đúng chỗ (Timeline import lại) |
| `src/hooks/useMonitor.ts` | **mới** — `useQueueSummary()` (`refetchInterval: 10_000`) |
| `src/hooks/useAuditLogs.ts` | **mới** |
| `src/hooks/usePublishJobs.ts` | thêm `useFailedJobs(page)` + `useRetryJob()` (invalidate cả `['publish-jobs']` lẫn `['monitor','queue']`) |
| `src/types/` | `QueueSummary`, `AuditLogItem`, `Paginated<T>` |

**Queue Monitor** — hàng thẻ số (waiting/active/delayed/failed) + badge "Redis OK/mất kết
nối", `Alert` đỏ liệt kê job kẹt, bảng job đang `QUEUED`/`PUBLISHING` sắp theo `scheduleTime`.
Bỏ nút "Refresh" giả hiện tại (đang chỉ reset filter) → nút refetch thật + nhãn "cập nhật lúc HH:mm:ss".

**Failed Jobs** — bảng phân trang server-side; cột lỗi rút gọn, nút **Xem nhật ký** mở
lại `JobEventsModal` **đã có sẵn** ở `components/timeline/` (di chuyển sang
`components/common/` để 2 màn dùng chung, không copy); nút **Đăng lại** gọi API thật
(hiện đang là mock `setHiddenIds`), chỉ hiện khi `can(role,'jobs:retry')`, xử lý đúng
409/400 mà service trả về.

**Audit Logs** — bảng phân trang; filter: khoảng ngày (`RangePicker`), action (select đổ
từ `/audit-logs/actions`), user (select từ `useUsers()`); cột "Thay đổi" đổi từ hiển thị
`oldValue/newValue` phẳng (kiểu mock) sang nút mở `Drawer` diff 2 khối JSON
`beforeValue`/`afterValue` — vì DB lưu JSONB chứ không phải chuỗi. Actor rỗng ⇒ hiện tag
**"Bot"** (audit của cron có `user_id = null`).

**Menu**: nhóm `Monitor` trong sidebar chỉ hiện khi `can(role,'queue:view')` /
`can(role,'audit:view')` — tức thực tế chỉ ADMIN.

## 4. Task

### Backend
- [x] Mở rộng `QueryPublishJobsDto` (`page`, `pageSize`, `from`, `to`) + repository
      `countMany` + đổi response `/publish-jobs` sang `{ items, total, page, pageSize }`
- [x] Tách `publishJobs.api.ts` ở FE (list mới + dời `getJobEvents`/`retryJob` khỏi
      `publishSchedule.api.ts`), chạy lại test Timeline
- [x] Module `monitor/` + `GET /monitor/queue/summary` (BullMQ counts + groupBy DB + stuck)
- [x] Xử lý Redis chết ⇒ trả `queue: null` + `queueError`, không 500
- [x] `audit.repository.findMany/countMany` + `AuditHttpModule` + `GET /audit-logs`
      + `GET /audit-logs/actions`
- [x] `sanitizeAuditValue()` lọc secret trong `beforeValue`/`afterValue`
- [x] `MONITOR_STUCK_MINUTES` vào `env.validation.ts` + `backend/.env.example`

### Frontend
- [x] `api/monitor.api.ts`, `api/audit.api.ts` + hook tương ứng
- [x] `QueueMonitorPage` nối API thật (thẻ số + cảnh báo job kẹt + auto refetch 10s)
- [x] `FailedJobsPage` nối API thật (phân trang + retry thật + nhật ký job)
- [x] Chuyển `JobEventsModal` sang `components/common/` và dùng chung 2 màn
- [x] `AuditLogsPage` nối API thật (filter ngày/action/user + Drawer diff JSON)
- [x] Ẩn nhóm menu Monitor với role không có `queue:view`/`audit:view`

### Chốt
- [x] Unit test bắt buộc: `sanitizeAuditValue` (lọc token lồng sâu, mảng, null) ·
      `MonitorService` (tính `stuck` theo clock fake, Redis lỗi ⇒ `queueHealthy=false`,
      DB/Redis lệch) · phân trang publish-jobs (offset/limit + `total` đúng filter)
- [x] `npm run lint && npm run build && npm run test` xanh cả BE lẫn FE
- [x] Cập nhật `contexts.md` (§1, §4 thêm M8, §5 nhật ký, §6 nếu còn nợ)
- [ ] Chuyển file plan này sang `plans/DONE/` — **giữ lại ở `plans/` cho tới khi smoke
      UI thật xong** (§5 chưa tick ô nào), theo rule 00 §Done.

## 5. Điều kiện nghiệm thu

Test tay trên UI thật (`VITE_USE_MOCK=false`), đăng nhập ADMIN.

> **Trạng thái 2026-07-25: CHƯA làm bước bấm tay trên trình duyệt.** Phần tương
> đương đã kiểm bằng API thật (curl, backend + Postgres + Redis) — xem §7 mục
> "Đã kiểm chứng". Các ô dưới đây chỉ được tick khi thật sự bấm trên UI.

- [ ] `/queue`: bấm `POST /auto-post/run-now` (hoặc chờ mốc giờ) ⇒ thẻ **waiting/active**
      nhảy số trong ≤10s mà không cần F5.
- [ ] Tắt container Redis ⇒ `/queue` vẫn render, hiện badge "mất kết nối Redis", **không**
      trắng trang / không 500. Bật lại ⇒ tự hồi.
- [ ] Sửa tay 1 job trong DB thành `PUBLISHING` với `updated_at` cách đây 30 phút ⇒ hiện
      trong khối cảnh báo "job kẹt", ghi đúng số phút.
- [ ] `/failed`: tạo job hỏng (page token sai) ⇒ job hiện trong danh sách; bấm **Xem nhật ký**
      thấy đủ 3 lần thử + `GAVE_UP`; bấm **Đăng lại** ⇒ job về QUEUED và biến khỏi danh sách
      sau refetch; bấm lại khi đang QUEUED ⇒ báo lỗi 409 rõ ràng.
- [ ] `/failed` phân trang: >20 job hỏng ⇒ sang trang 2 lấy dữ liệu mới từ server (không
      cắt ở client).
- [ ] `/audit`: sửa token 1 page (`PAGE_TOKEN_UPDATE`) ⇒ dòng log xuất hiện, mở Drawer diff
      thấy giá trị token là `***`, **không lộ token dù chỉ một phần**.
- [ ] `/audit`: lọc theo user + khoảng ngày ra đúng tập; log do cron ghi hiện actor **"Bot"**.
- [ ] `/timeline` vẫn chạy đúng như trước sau khi đổi response `/publish-jobs`.
- [ ] Đăng nhập EDITOR ⇒ **không thấy** nhóm menu Monitor; gõ thẳng `/queue`, `/failed`,
      `/audit` ⇒ bị chặn (403/redirect).

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Đổi response `/publish-jobs` làm gãy `/timeline` (đang dùng mảng trần) | Sửa FE trong **cùng commit**; chạy lại test FE của Timeline trước khi làm tiếp Monitor |
| Audit log lộ token qua `beforeValue`/`afterValue` | `sanitizeAuditValue()` **lọc theo tên key, đệ quy**, có unit test; mặc định che khi nghi ngờ (deny by default) |
| `getJobCounts()` treo khi Redis chết ⇒ API treo theo | Bọc `Promise.race` timeout 2s, hỏng ⇒ `queue: null`; không để màn giám sát chết theo thứ nó giám sát |
| Bảng `audit_logs` lớn dần ⇒ query chậm | Bắt buộc phân trang server-side + đã có index `action`, `user_id`, `created_at`; **cấm** endpoint trả toàn bộ |
| Polling 10s × nhiều tab ⇒ tải DB | Chỉ `/queue` poll (query nhẹ: 1 `getJobCounts` + 1 `groupBy`); `/failed` và `/audit` chỉ refetch khi thao tác |
| `AuditModule` bị import khắp nơi, thêm controller ⇒ vòng phụ thuộc | Tách `AuditHttpModule` riêng — đúng bài học `SettingsHttpModule` ở `contexts.md` §7 |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-25
- **File chính:**
  - BE: `backend/src/modules/monitor/` (service/controller/mapper/module),
    `backend/src/modules/audit/{audit.controller,audit-http.module,audit-log.mapper,
    sanitize-audit-value}.ts` + `audit.repository.ts` (findMany/countMany/distinctActions),
    `backend/src/modules/publish-jobs/{publish-jobs.repository,publish-jobs.service,
    publish-jobs.controller}.ts` + `dto/query-publish-jobs.dto.ts`
  - FE: `src/api/{monitor,audit,publishJobs,queryString}.ts`,
    `src/hooks/{useMonitor,useAuditLogs,usePublishJobs}.ts`,
    `src/pages/{QueueMonitorPage,FailedJobsPage,AuditLogsPage}.tsx`,
    `src/components/common/JobEventsModal.tsx` (chuyển từ `components/timeline/`)
- **Khác thiết kế ban đầu:**
  1. `from`/`to` dùng định dạng `YYYY-MM-DD` (như `date` sẵn có ở DTO), không phải
     `DD-MM-YYYY` như plan §3.2a viết — giữ một quy ước ngày duy nhất cho toàn API.
  2. `GET /monitor/queue/summary` trả thêm `activeJobs` (job QUEUED/PUBLISHING, tối đa 50)
     và `stuckThresholdMinutes`. Nhờ vậy màn `/queue` chỉ cần **một** endpoint để poll thay
     vì gọi thêm `/publish-jobs?status=QUEUED` rồi `?status=PUBLISHING` (2 request/10s).
  3. Hook `usePublishJobEvents`/`useRetryPublishJob` chuyển từ `usePublishSchedule.ts`
     sang `usePublishJobs.ts` cho khớp việc tách api layer; `TimelinePage` import lại.
     Retry giờ invalidate thêm key `['monitor']` để thẻ số ở `/queue` không bị cũ.
  4. Thêm `src/api/queryString.ts` — hàm ghép query dùng chung (trước nằm riêng trong
     `publishSchedule.api.ts`), 3 api layer mới đều dùng.
  5. Menu Monitor **không phải sửa**: `AdminLayout` đã lọc bằng `canAccessRoute` và
     `/queue`, `/failed`, `/audit` vốn chỉ mở cho ADMIN.
- **Test:** BE **516 test xanh** (+31: 18 `sanitizeAuditValue`, 10 `MonitorService`,
  3 phân trang publish-jobs) · FE 32 test cũ vẫn xanh · lint + build xanh cả hai phía.
- **Đã kiểm chứng bằng API thật** (backend + Postgres + Redis, chạy instance tạm để không
  đụng cron của backend đang chạy):
  - `GET /monitor/queue/summary` trả đúng số BullMQ (`failed: 2, completed: 1`) và
    `groupBy` DB (`SUCCESS: 3, FAILED: 2`).
  - **Redis chết** (trỏ sai port): HTTP **200**, `queue: null`,
    `queueError: "Quá 2000ms không phản hồi"`, phần `db` vẫn đủ — không 500, không treo.
  - **Job kẹt**: sửa tay 1 job thành `PUBLISHING` với `updated_at` cách 30 phút ⇒ hiện
    trong `stuck` đúng `stuckMinutes: 30`; đã trả job về `SUCCESS` sau khi kiểm.
  - **Phân trang** `/publish-jobs?page=1&pageSize=2` ⇒ `total: 5`, 2 item;
    `?status=FAILED` ⇒ `total: 2`; `?from=25-07-2026` ⇒ 400 đúng thông báo.
  - `/audit-logs` phân trang + lọc `action`/`userId`/`from`/`to` ra đúng tập; log của
    cron trả `actor: null` (UI hiện tag "Bot"); `/audit-logs/actions` trả 18 action.
  - **RBAC**: EDITOR gọi `/monitor/queue/summary` và `/audit-logs` ⇒ **403**,
    `/publish-jobs` ⇒ 200 (đúng, vẫn là `timeline:view`); không token ⇒ 401.
    User EDITOR tạo để test đã xoá.
- **Còn nợ:** **chưa bấm tay trên UI thật** — toàn bộ §5 còn nguyên. Cụ thể chưa kiểm:
  auto-refetch 10s trên trình duyệt, Drawer diff JSON, nút "Đăng lại" ở `/failed`
  (đường API đã có test + đã dùng ở `/timeline`), và `/timeline` sau khi đổi shape
  `/publish-jobs` (màn này không gọi endpoint đó nên rủi ro thấp, nhưng vẫn phải mở xem).
  `search` theo tiêu đề đã làm ở backend nhưng **chưa gắn ô tìm kiếm** trên `/failed`.
