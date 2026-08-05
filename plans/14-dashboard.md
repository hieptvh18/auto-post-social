# Plan 14 — Tổng quan (Dashboard) chạy số liệu thật

**Milestone:** M9 (Phase 2, sau M8 Monitor)
**Trạng thái:** 🟡 code + test + smoke API xong — **chưa bấm tay trên UI thật**
**Phụ thuộc:** Plan 04/11 (`content_assets` + assignment), Plan 05 (`facebook_pages`),
Plan 07 (`publish_jobs`, `slot_runs`), Plan 12 (`ClockService`, `datetime.util`)
**Spec tham chiếu:** `docs/01-business-requirements.md` §FR-08 · `docs/04-api-spec.md` §8 ·
`docs/05-rbac.md` §2 (`dashboard:view` — **cả 3 role đều có**)

---

## 1. Mục tiêu

`/dashboard` là **màn hình cuối cùng còn chạy mock** (contexts §1). Sau plan này nó trả lời
được 3 câu hỏi bằng dữ liệu thật, không phải mở DB:

1. **Kho bài đang đứng ở đâu?** — còn bao nhiêu bài chờ duyệt / đã duyệt sẵn cho Bot,
   bao nhiêu video đạt ADS.
2. **Bot chạy tốt không?** — trong khoảng ngày đã chọn: đăng thành công / thất bại bao nhiêu,
   tỷ lệ ra sao, page nào đăng nhiều.
3. **Có gì đang hỏng ngay lúc này?** — mốc giờ bị bỏ lỡ, job lỗi chưa xử lý, page sắp hết token.

Câu 3 là phần **thêm so với docs** — xem §3.5, lý do ở đó.

Khác các màn đã có: `/timeline` nhìn **một ngày** theo slot, `/queue` `/failed` nhìn **kỹ thuật
job**, Dashboard nhìn **xu hướng theo khoảng ngày + sức khoẻ tổng thể**, và là màn **duy nhất
mọi role đều vào được** ⇒ bắt buộc có scoping theo role (§3.4).

## 2. Ngoài phạm vi

- **Không** làm bảng/materialized view thống kê, không cron rollup, không cache Redis.
  Tất cả tính trực tiếp bằng `groupBy`/`count` lúc request (dữ liệu MVP còn nhỏ; khi
  `publish_jobs` > ~1 triệu dòng mới tính lại — ghi vào §6 rủi ro).
- **Không** đụng `schema.prisma` ⇒ **plan này không có migration, `erd.md` không đổi**.
  Nếu phát sinh nhu cầu đổi schema ⇒ dừng, báo user, cập nhật `erd.md` theo rule 05.
- **Không** làm so sánh kỳ trước (%tăng/giảm), không export Excel/CSV, không realtime
  WebSocket. Dashboard **không poll** (khác `/queue`) — chỉ refetch khi đổi filter hoặc bấm.
- **Không** thống kê chỉ số Facebook (reach/like/comment) — hệ thống không hề gọi Insights API.
  Đây là thứ dễ bị hiểu nhầm là "thống kê" nhất; nếu user muốn, đó là feature mới cần token
  quyền `read_insights`.
- **Không** thêm nút thao tác (duyệt/retry) trên Dashboard — chỉ đọc + link sang màn tương ứng.

## 3. Thiết kế

### 3.1 Bức tranh chung

```text
GET /dashboard/stats?from=&to=            → 8 thẻ số (FR-08.4 + FR-08.2)
GET /dashboard/chart/daily?from=&to=      → chart cột theo ngày (FR-08.5)
GET /dashboard/posts-by-page?from=&to=&mediaType=  → chart theo page (FR-08.3)
GET /dashboard/health                     → khối "Cần chú ý" (MỚI, xem §3.5)
```

Giữ đúng 3 endpoint tên như `docs/04-api-spec.md` §8 (spec cố định, rule 00 §1 — không đổi
đường dẫn cho "gọn"), thêm 1 endpoint `health` **không nằm trong docs** ⇒ ghi rõ là bổ sung
ngoài spec và nêu lý do ở §3.5.

Module mới, **chỉ đọc**, không service nào khác import:

```text
backend/src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts      # @RequirePermission('dashboard:view')
├── dashboard.service.ts         # ghép số + áp scope theo role
├── dashboard.repository.ts      # toàn bộ groupBy/count/raw SQL
├── dto/query-dashboard.dto.ts   # from, to, mediaType
├── dashboard.types.ts
└── __tests__/dashboard.service.spec.ts
```

### 3.2 Quy ước ngày & mốc thời gian — chốt trước khi code

Đây là chỗ dễ ra số sai nhất, chốt một lần:

| Vấn đề | Quyết định |
|--------|-----------|
| Định dạng `from`/`to` | `YYYY-MM-DD` — **cùng quy ước với toàn API** (đã chốt ở plan 13 §7). Hiểu theo `Asia/Ho_Chi_Minh`, quy đổi UTC bằng `dayRangeUtc()` sẵn có |
| Thiếu `from`/`to` | Mặc định **7 ngày gần nhất** tính theo hôm nay VN (`ClockService`), không phải "toàn bộ lịch sử" |
| `from > to` | 400 |
| Khoảng tối đa | **366 ngày** ⇒ vượt thì 400. Chặn ở DTO/service, tránh chart 5 năm 1800 cột |
| Job tính theo mốc nào | **`schedule_time`** — không dùng `published_at` vì job `FAILED` không có `published_at`, dùng lẫn 2 cột thì tổng success+failed không khớp cột nào |
| Content tính theo mốc nào | `created_at` (ngày upload) cho các số "sản lượng"; **không** dùng `updated_at` (Bot chạm vào là bài nhảy sang khoảng khác) |

**Số nào phụ thuộc khoảng ngày, số nào không** — quy ước để UI ghi nhãn cho đúng:

- **Tồn kho (snapshot hiện tại, KHÔNG theo range):** `pendingReview`, `approved`.
  Câu hỏi "còn bao nhiêu bài chờ duyệt" luôn là câu hỏi *bây giờ*; lọc theo range 7 ngày
  làm bài tồn từ tháng trước biến mất khỏi thẻ số — sai nghiệp vụ.
  ⇒ UI ghi nhãn **"hiện tại"** trên 2 thẻ này. *(Khác mock hiện tại, khác cách hiểu ngây thơ
  của FR-08.4 — nếu user muốn cả 2 thẻ này chạy theo range thì đổi 1 dòng ở repository.)*
- **Sản lượng (theo range):** `successPosts`, `failedPosts`, `adsVideos`, `newContent`.
- **Cấu hình (không range):** `activePages`, `activeUsers`, `publishing`
  (`publishing` = đang diễn ra ⇒ luôn là *bây giờ*).

### 3.3 Từng endpoint

**a) `GET /dashboard/stats?from=&to=`**

```jsonc
{
  "range": { "from": "2026-07-19", "to": "2026-07-25" },
  "inventory": {                 // không phụ thuộc range
    "pendingReview": 5,
    "approved": 12,
    "rejected": 2,
    "approvedUnassigned": 4      // đã duyệt nhưng CHƯA phân bổ page nào ⇒ Bot không lấy được
  },
  "production": {                // theo range
    "newContent": 20,
    "adsVideos": 8,
    "successPosts": 140,
    "failedPosts": 3,
    "successRate": 97.9          // làm tròn 1 số lẻ; mẫu số = success+failed, mẫu 0 ⇒ null
  },
  "live": {                      // ngay lúc này
    "publishing": 1,             // QUEUED + PUBLISHING
    "activePages": 3,
    "autopostEnabledPages": 2,
    "activeUsers": 4             // chỉ trả cho ADMIN, role khác = null (§3.4)
  }
}
```

Giữ đủ 8 số của `docs/04` §8 nhưng **gom nhóm** thay vì phẳng — vì mỗi nhóm có ngữ nghĩa
thời gian khác nhau (§3.2), để phẳng thì FE không biết ghi nhãn "hiện tại" hay "trong kỳ".
Ghi vào §7 "khác spec".

`approvedUnassigned` là số thêm, và là số **hữu ích nhất** cho vận hành: nó giải thích tại sao
slot ra `SKIPPED/NO_CONTENT` dù kho vẫn còn bài (đúng bài học ở plan 07 §readiness).

Repository: gộp bằng `$transaction([...])` các `count`/`groupBy` — một round-trip, không
gọi 8 lần rời rạc.

**b) `GET /dashboard/chart/daily?from=&to=`**

```jsonc
{ "items": [ { "date": "2026-07-19", "success": 12, "failed": 1, "publishedContent": 12 } ] }
```

- `groupBy` không gom được theo **ngày VN** ⇒ dùng raw SQL:
  `date_trunc('day', schedule_time AT TIME ZONE 'Asia/Ho_Chi_Minh')`.
  Đây là điểm dễ sai kinh điển (lệch 7h ⇒ bài 00:30 nhảy về ngày hôm trước) ⇒ **bắt buộc
  có unit test** với dữ liệu cận biên 23:30 và 00:30 giờ VN.
- **Ngày không có job vẫn phải có dòng, giá trị 0** — điền dải ngày ở service (hàm thuần
  `fillDateRange()`), không để chart nhảy cóc.

**c) `GET /dashboard/posts-by-page?from=&to=&mediaType=image|video|all`**

```jsonc
{ "items": [ { "pageId": "...", "pageName": "...", "imagePosts": 12, "videoPosts": 20, "failedPosts": 1 } ] }
```

- Chỉ đếm job `SUCCESS` cho `imagePosts`/`videoPosts` (kèm `failedPosts` để thấy page nào hay lỗi).
- `mediaType` lấy từ `content_assets.media_type` (join), không có cột media trên `publish_jobs`.
- Bỏ page `deleted_at != null`; page tạm dừng (`is_active=false`) **vẫn hiện** nếu có job
  trong kỳ — che đi thì mất số liệu lịch sử.
- Sắp xếp `successPosts DESC`, giới hạn không cần (số page nhỏ).

**d) `GET /dashboard/health`** — xem §3.5.

### 3.4 RBAC — phần dễ sai nhất, bắt buộc test

`dashboard:view` cấp cho **cả 3 role**, nhưng dữ liệu thì không thể cấp như nhau:

| Số liệu | ADMIN | EDITOR | CONTENT |
|---------|-------|--------|---------|
| `inventory.*`, `production.newContent`, `adsVideos` | toàn hệ thống | toàn hệ thống | **chỉ bài do chính mình tạo** (`created_by = actor`) |
| `production.successPosts/failedPosts`, chart daily, posts-by-page | ✓ | ✓ | **chỉ job của bài mình** |
| `live.activeUsers` | ✓ | `null` | `null` |
| `live.activePages`, `autopostEnabledPages` | ✓ | ✓ | ✓ |
| `/dashboard/health` | ✓ đầy đủ | ✓ trừ khối token page | **403** |

Lý do: CONTENT ở `content-assets` đã bị scope "chỉ bài của mình" (plan 04). Nếu Dashboard trả
tổng toàn hệ thống thì **rò rỉ ngược** — CONTENT đếm được sản lượng của người khác. Scope này
áp ở **service**, không phải guard (rule 02 §RBAC field-level) ⇒ **bắt buộc unit test**.

`/dashboard/health` chặn bằng permission thứ hai: dùng lại `queue:view` (ADMIN) cho khối job
kẹt/token, và `autopost:manage` (ADMIN+EDITOR) cho khối slot bỏ lỡ — không thêm permission mới.

### 3.5 `GET /dashboard/health` — khối "Cần chú ý" (bổ sung ngoài docs)

Lý do thêm: 4 sự cố đã thực sự xảy ra trong quá trình làm M5–M8 (slot `SKIPPED/NO_CONTENT`
mà không ai biết, page chưa bật autopost, job `FAILED` nằm im, token hết hạn) đều **không**
nhìn thấy được ở bất kỳ màn nào trừ khi chủ động mở đúng trang. Dashboard là màn đầu tiên
mọi role nhìn thấy sau khi login ⇒ đúng chỗ để cảnh báo.

```jsonc
{
  "checkedAt": "...",
  "alerts": [
    { "level": "error",   "code": "FAILED_JOBS",      "count": 3,
      "message": "3 bài đăng thất bại trong 7 ngày qua", "link": "/failed" },
    { "level": "warning", "code": "MISSED_SLOTS",     "count": 2,
      "message": "2 mốc giờ hôm nay chưa chạy được vì hết bài", "link": "/timeline" },
    { "level": "warning", "code": "EMPTY_POOL",       "count": 1,
      "message": "1 page đã bật tự động nhưng không còn bài dùng được", "link": "/auto-post" },
    { "level": "warning", "code": "TOKEN_EXPIRING",   "count": 1,
      "message": "1 page có token hết hạn trong 7 ngày tới", "link": "/pages" },
    { "level": "error",   "code": "STUCK_JOBS",       "count": 1,
      "message": "1 job kẹt ở trạng thái đang đăng", "link": "/queue" }
  ]
}
```

- Mảng **rỗng nghĩa là mọi thứ ổn** ⇒ UI hiện dải xanh "Hệ thống đang chạy bình thường".
  Không đẻ alert giả để lấp chỗ trống.
- `MISSED_SLOTS` đọc `slot_runs` hôm nay (`status=SKIPPED`), **dùng lại** logic đã có ở
  plan 12/07 — không viết lại cách tính readiness lần thứ hai.
- `STUCK_JOBS` **dùng lại** `MonitorService` (plan 13) qua import, không copy ngưỡng
  `MONITOR_STUCK_MINUTES`.
- `TOKEN_EXPIRING`: `token_expire_at < now + 7 ngày`, chỉ page chưa xoá. Ngưỡng 7 ngày
  hardcode hằng số trong module, **không** thêm biến env (rule 04 chỉ bắt buộc env cho
  secret/URL; đây là hằng nghiệp vụ).
- Mỗi alert **phải có `link`** sang màn xử lý được — cảnh báo không có đường đi tiếp là vô dụng.

### 3.6 Frontend

| File | Việc |
|------|------|
| `src/api/dashboard.api.ts` | **mới** — 4 hàm, dùng `queryString.ts` sẵn có |
| `src/hooks/useDashboard.ts` | **mới** — `useDashboardStats(range)`, `useDailyChart(range)`, `usePostsByPage(range, mediaType)`, `useDashboardHealth()` |
| `src/types/index.ts` | `DashboardStats`, `DailyChartItem`, `PostsByPageItem`, `DashboardAlert` |
| `src/pages/DashboardPage.tsx` | tách `RealDashboardPage` / `MockDashboardPage` theo `env.useMock` — **giữ nhánh mock** (ADR-005), không xoá |

Bố cục (giữ nguyên khung mock hiện có, chỉ đổi nguồn dữ liệu + thêm 1 khối):

```text
┌ PageHeader "Tổng quan"                       [RangePicker + presets] ┐
├ Khối "Cần chú ý"  ← MỚI: Alert list, ẩn hẳn khi không có alert       ┤
├ Hàng thẻ số: Tồn kho (nhãn "hiện tại") | Sản lượng (nhãn "trong kỳ") ┤
├ Chart cột theo ngày (success/failed)   │  Chart theo page (ảnh/video)┤
├ Tỷ lệ thành công / thất bại                                          ┤
└──────────────────────────────────────────────────────────────────────┘
```

- Giữ `recharts` (đã dùng ở mock, đã có trong `package.json`) — không thêm thư viện chart mới.
- **Nhãn thời gian phải hiện rõ trên từng thẻ** ("hiện tại" vs "trong kỳ đã chọn") — thẻ số
  không nói mình tính theo mốc nào là nguồn hiểu sai số liệu số 1.
- Thẻ nào bị scope/`null` theo role thì **ẩn hẳn**, không hiện "0" (0 và "không được xem"
  là hai chuyện khác nhau).
- RangePicker: presets Hôm nay / 7 ngày / 30 ngày / Tháng này / Tháng trước; giá trị mặc định
  7 ngày; **đồng bộ vào query param URL** (`?from=&to=`) để share link được.
- Loading dùng `Skeleton` từng khối, không chặn cả trang; lỗi 1 khối không làm trắng trang
  (mỗi hook độc lập).

## 4. Task

### Backend
- [x] `dashboard.repository.ts`: `countContentByStatus` (scope theo actor), `countApprovedUnassigned`,
      `countJobsByStatus(range)`, `countAdsVideos(range)`, `countPages`, `countActiveUsers`
- [x] `dashboard.repository.ts`: raw SQL `dailyJobStats(range)` gom theo ngày VN
      (`AT TIME ZONE 'Asia/Ho_Chi_Minh'`) + `postsByPage(range, mediaType)`
- [x] `dashboard.service.ts`: ghép số, tính `successRate` (mẫu 0 ⇒ `null`), điền ngày trống,
      **áp scope theo role** (§3.4)
- [x] `dto/query-dashboard.dto.ts`: `from`/`to` `YYYY-MM-DD` optional (mặc định 7 ngày),
      `from > to` ⇒ 400, khoảng > 366 ngày ⇒ 400, `mediaType` enum
- [x] `dashboard.controller.ts` 4 endpoint + Swagger, `@RequirePermission('dashboard:view')`
- [x] `GET /dashboard/health`: gom alert, dùng lại `MonitorService` (stuck) + `slot_runs` hôm nay,
      chặn CONTENT
- [x] `DashboardModule` đăng ký ở `app.module.ts` — **kiểm vòng phụ thuộc** khi import
      `MonitorModule` (bài học `SettingsHttpModule`/`AuditHttpModule`); vòng ⇒ tách service dùng chung

### Frontend
- [x] `api/dashboard.api.ts` + `hooks/useDashboard.ts` + types
- [x] `DashboardPage` tách Real/Mock, nối 4 endpoint, RangePicker đồng bộ URL
- [x] Khối "Cần chú ý" (ẩn khi rỗng, mỗi alert có link sang màn xử lý)
- [x] Ẩn thẻ số theo role (CONTENT không thấy `activeUsers`, EDITOR không thấy `activeUsers`)
- [x] **Bổ sung 2026-08-05 (yêu cầu user):** line chart "Tỷ lệ thành công/thất bại theo
      ngày" (tính lại từ `chart/daily` đã fetch, không thêm API) + bar chart "Tổng bài đăng
      thành công theo page" (gọi `posts-by-page` với `mediaType=all` cố định, độc lập bộ lọc
      ảnh/video) + bar ngang "Top danh mục đăng thành công nhiều nhất" (endpoint mới, xem
      Backend bên dưới). Đã `npm run lint && npm run build && npm run test` xanh (FE 35 test).
      Chưa smoke UI — gộp vào §5.

### Backend — bổ sung 2026-08-05 (ngoài phạm vi ban đầu, theo yêu cầu user)
- [x] `GET /dashboard/top-categories?from=&to=&limit=` — **ngoài `docs/04` §8**, cùng kiểu bổ
      sung như `/health` (§3.5). `dashboard.repository.ts` thêm `topCategoriesBySuccess()`:
      raw SQL group theo `content_assets.category` (text tự do, không bảng riêng), đếm
      `publish_jobs.status='SUCCESS'` + `COUNT(DISTINCT facebook_page_id)` làm `pageCount`,
      loại page đã xoá mềm, `LIMIT` mặc định 10 (tối đa 50).
- [x] `dto/query-dashboard.dto.ts`: `QueryTopCategoriesDto` (`limit` optional int 1–50,
      mặc định 10, `@Type(() => Number)` theo đúng pattern các DTO phân trang khác).
- [x] `dashboard.service.ts`: `getTopCategories()` — cùng `resolveRange()` + scope RBAC như
      `production.successPosts` (CONTENT chỉ thấy danh mục trong bài của mình).
- [x] `dashboard.controller.ts`: endpoint mới, `@RequirePermission('dashboard:view')` sẵn có
      ở class (không thêm permission mới).
- [x] Test: mặc định `limit=10` · truyền `limit` tuỳ chỉnh · scope CONTENT · trả đúng
      `range`/`items` từ repository (4 test, BE 714 tổng xanh).
- [x] Không đụng `schema.prisma` ⇒ `erd.md` giữ nguyên, không thêm biến env.

### Test (rule 02 — chỉ vùng dễ sai)
- [x] **Gom ngày theo timezone VN**: job lúc 23:30 và 00:30 giờ VN rơi đúng ngày, không lệch 7h
- [x] **Điền ngày trống**: range 7 ngày mà chỉ 2 ngày có job ⇒ vẫn trả 7 dòng
- [x] **Scope RBAC**: CONTENT chỉ đếm bài mình · EDITOR không nhận `activeUsers` ·
      CONTENT gọi `/dashboard/health` ⇒ 403
- [x] **`successRate`**: 0 job xong ⇒ `null` (không phải `0` hay `NaN`), làm tròn đúng
- [x] **Validate range**: `from > to` ⇒ 400 · > 366 ngày ⇒ 400 · thiếu cả hai ⇒ mặc định 7 ngày
- [x] `npm run lint && npm run build && npm run test` xanh cả BE lẫn FE

### Chốt
- [x] Cập nhật `contexts.md` (§1 bỏ "còn mock: DashboardPage", §4 thêm M9, §5 nhật ký)
- [x] Cập nhật `PLAN-MVP.md` (hàng M9)
- [ ] `git mv` plan sang `plans/DONE/` **sau khi** §5 tick xong

## 5. Điều kiện nghiệm thu

Test tay trên UI thật (`VITE_USE_MOCK=false`).

- [ ] ADMIN vào `/dashboard`: 4 khối lên số, không có khối nào lỗi/trắng.
- [ ] Đổi range sang "Hôm nay" ⇒ số sản lượng đổi, thẻ "Chờ duyệt/Đã duyệt" **không đổi**
      (đúng thiết kế snapshot §3.2); copy URL mở tab mới ⇒ giữ nguyên range.
- [ ] Đối chiếu tay: `successPosts` khớp số dòng `SUCCESS` đếm được ở `/failed`/DB trong cùng kỳ.
- [ ] Đăng 1 bài thành công lúc **23:30 giờ VN** ⇒ cột chart rơi đúng ngày hôm đó, không lùi 1 ngày.
- [ ] Range chỉ chứa ngày không có job ⇒ chart hiện đủ cột 0, tỷ lệ hiện "—" chứ không phải `NaN%`.
- [ ] Tạo 1 job FAILED + 1 slot `SKIPPED` hôm nay ⇒ khối "Cần chú ý" hiện đúng 2 alert,
      bấm link nhảy đúng `/failed` và `/timeline`.
- [ ] Hệ thống sạch (không lỗi) ⇒ khối "Cần chú ý" hiện dải xanh, không hiện alert rỗng.
- [ ] Đăng nhập CONTENT ⇒ chỉ thấy số bài của chính mình, **không** thấy thẻ "Nhân sự active",
      gõ thẳng API `/dashboard/health` ⇒ 403.
- [ ] Đăng nhập EDITOR ⇒ thấy số toàn hệ thống, không thấy "Nhân sự active".

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Gom ngày sai timezone (lệch 7h) ⇒ chart sai mà nhìn vẫn "hợp lý" | Raw SQL `AT TIME ZONE 'Asia/Ho_Chi_Minh'` + test cận biên 23:30/00:30 bắt buộc |
| CONTENT thấy số liệu người khác qua Dashboard (rò rỉ ngược so với `/content`) | Scope ở service + test RBAC bắt buộc (§3.4) |
| Nhiều query đếm ⇒ Dashboard chậm | Gộp `$transaction`, mỗi endpoint tách riêng để hỏng 1 khối không chết cả trang; index `status`/`schedule_time`/`is_ads` đã có sẵn |
| `publish_jobs` lớn dần ⇒ `groupBy` theo range quét nhiều | Chặn range ≤ 366 ngày; khi dữ liệu lớn thật thì tính bảng rollup — ghi nợ §6 `contexts.md`, **không** làm sớm |
| Số trên Dashboard lệch số trên `/timeline`/`/failed` ⇒ mất niềm tin | Chốt một mốc duy nhất `schedule_time` (§3.2) và dùng chung filter với `publish-jobs.repository`, không viết điều kiện lần hai |
| Import `MonitorModule` gây vòng phụ thuộc | Đã gặp 2 lần (`SettingsHttpModule`, `AuditHttpModule`) — nếu vòng thì tách phần dùng chung ra module con, không import chéo |
| Thẻ "Chờ duyệt" snapshot khác cách hiểu của user | Ghi nhãn "hiện tại" ngay trên thẻ; nếu user muốn theo range thì đổi 1 dòng repository (đã cô lập) |

---

## 7. Kết quả

- **Ngày xong (code + test + smoke API):** 2026-07-26
- **File chính:**
  - BE: `backend/src/modules/dashboard/` — `dashboard.{controller,service,repository,
    mapper,types,module}.ts`, `dashboard-range.ts` (hàm thuần), `dto/query-dashboard.dto.ts`,
    `__tests__/{dashboard-range,dashboard.service}.spec.ts`.
    Sửa kèm: `monitor.module.ts` và `auto-post-configs.module.ts` thêm `exports` để
    Dashboard mượn service; `app.module.ts` đăng ký `DashboardModule`.
  - FE: `src/api/dashboard.api.ts`, `src/hooks/useDashboard.ts`,
    `src/pages/DashboardPage.tsx` (tách `RealDashboardPage` / `MockDashboardPage`),
    types mới trong `src/types/index.ts`.
- **Khác thiết kế ban đầu:**
  1. **Lỗi timezone thật sự nằm ở chỗ khác plan dự đoán.** Plan viết
     `schedule_time AT TIME ZONE 'Asia/Ho_Chi_Minh'`, và **đúng câu đó là sai**: Prisma map
     `DateTime` sang `timestamp` *without* time zone, nên một lần `AT TIME ZONE` khiến
     Postgres hiểu giá trị đang lưu **là giờ VN** rồi cộng nhầm chiều. Phải viết
     `schedule_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'`. Smoke test bắt
     được (hai bài 23:30 và 00:30 dồn hết vào một ngày); unit test **không thể** bắt vì lỗi
     nằm trong SQL. Xem §7 "Đã kiểm chứng".
  2. `ORDER BY "imagePosts" + "videoPosts"` gây lỗi 500 — Postgres không cho dùng alias
     output trong **biểu thức** `ORDER BY`; phải lặp lại nguyên hàm `COUNT(*) FILTER (...)`.
  3. `countContentInventory` dùng `Promise.all` thay vì `$transaction` như plan §3.3a:
     gộp `groupBy` + `count` vào một mảng `$transaction` làm Prisma suy kiểu `_count`
     thành union và mất `_all`. Các chỗ chỉ toàn `count` thì vẫn giữ `$transaction`.
  4. Thêm `scopedToOwnContent` vào response `stats` — FE cần biết mình đang xem số liệu
     bị thu hẹp để đổi câu mô tả, thay vì đoán theo role lần nữa ở phía client.
  5. `/dashboard/health`: **EDITOR không nhận `TOKEN_EXPIRING`** (token là dữ liệu nhạy
     cảm, chỉ ADMIN). Plan §3.4 đã ghi ý này ở bảng, nay hiện thực đúng như vậy.
  6. FE thêm cột **"Thất bại"** vào chart theo page (plan chỉ vẽ ảnh/video) — page hỏng
     nhiều mà cột chỉ vẽ phần thành công thì nhìn như page đó "ít bài", không phải "hay lỗi".
- **Test:** BE **542 test xanh (+26)** — 8 test `dashboard-range` (mặc định 7 ngày, biên UTC,
  `from > to`, đúng/quá 366 ngày, điền ngày trống) + 18 test `DashboardService` (scope
  ADMIN/EDITOR/CONTENT, `activeUsers` null, `successRate` null ≠ 0, 5 loại alert, chặn
  CONTENT ở `/health`). FE 32 test cũ vẫn xanh. lint + build xanh cả hai phía.
- **Đã kiểm chứng bằng API thật** (instance tạm cổng 3210, `AUTOPOST_ENABLED=false` để không
  đụng cron của backend đang chạy; dữ liệu smoke đã xoá sạch sau khi kiểm):
  - `/dashboard/stats` không tham số ⇒ kỳ mặc định `2026-07-20 → 2026-07-26`, số khớp DB
    (`successPosts: 3`, `failedPosts: 2`, `successRate: 60`).
  - **Timezone:** chèn 2 job `SUCCESS` lúc **23:30 ngày 22/07** và **00:30 ngày 23/07** giờ
    VN (cả hai lưu UTC cùng ngày 22/07) ⇒ trước khi sửa cả hai rơi vào 22/07 (**lỗi**);
    sau khi sửa rơi đúng 22/07 và 23/07. Lọc `from=to=2026-07-23` ⇒ đúng 1 bài.
  - **Validate:** `from > to` ⇒ 400 · 572 ngày ⇒ 400 kèm số ngày · đúng 366 ngày ⇒ 200 ·
    `from=26-07-2026` ⇒ 400 · `mediaType=gif` ⇒ 400 · không token ⇒ 401.
  - **RBAC:** EDITOR ⇒ số toàn hệ thống nhưng `activeUsers: null`, `/health` không có
    `TOKEN_EXPIRING`. CONTENT ⇒ `scopedToOwnContent: true`, mọi số bài = 0 (user mới, chưa
    tạo bài), `successRate: null`, `posts-by-page` rỗng, `/health` ⇒ **403**.
  - `/dashboard/health` trên dữ liệu thật ra 2 cảnh báo đúng thực tế: `FAILED_JOBS` (2) và
    `EMPTY_POOL` (1 page bật auto nhưng hết bài).
- **Còn nợ:** **chưa bấm tay trên UI thật** — toàn bộ §5 còn nguyên. Cụ thể chưa kiểm trên
  trình duyệt: RangePicker đồng bộ URL, khối "Cần chú ý" bấm link nhảy màn, ẩn thẻ "Nhân sự"
  với EDITOR/CONTENT, chart rỗng hiện "—" thay vì `NaN%`.
