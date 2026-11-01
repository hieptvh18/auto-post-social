# Plan 35 — Dashboard tab "Thống kê đăng bài" (lọc page · ngày/tháng · danh mục)

**Milestone:** Phase 2 — mở rộng M9 (Dashboard, plan 14)
**Trạng thái:** 🟡 code + test + smoke SQL xong 2026-11-01 — **chưa bấm tay trên UI thật**
**Phụ thuộc:** Plan 14 (module `dashboard`, `dashboard-range.ts`, scope theo role).
Không phụ thuộc plan 36 — nhưng nếu plan 36 xong trước thì thêm filter Mới/Cũ (§3.6).
**Spec tham chiếu:** `docs/01-business-requirements.md` §FR-08 · `docs/04-api-spec.md` §8 ·
`docs/05-rbac.md` §2 (`dashboard:view` — cả 3 role)

---

## 1. Mục tiêu

Trả lời đúng một câu hỏi của user: **"Trong khoảng thời gian X, page A/B/C đã đăng được bao
nhiêu bài, thuộc danh mục nào?"** — đếm theo **ngày** hoặc theo **tháng**, lọc được theo một
hoặc nhiều page và một hoặc nhiều danh mục.

Màn `/dashboard` tách thành 2 tab:

| Tab | Nội dung |
|-----|----------|
| **Tab 1 — Thống kê đăng bài** (MỚI) | Bộ lọc + bảng page × ngày/tháng + breakdown danh mục |
| **Tab 2 — Tổng quan** | Giữ **nguyên** màn Dashboard hiện tại (thẻ số, chart, Cần chú ý) |

## 2. Ngoài phạm vi

- **Không** đổi gì trong tab Tổng quan (tab 2) — chỉ bọc nó vào `Tabs`, không sửa logic/endpoint cũ.
- **Không** đụng `schema.prisma` ⇒ không migration, `erd.md` không đổi.
- **Không** export Excel/CSV, không so sánh kỳ trước, không cache/rollup.
- **Không** thống kê reach/like (đã có ở plan 25 — Page Insights).
- **Không** lọc theo "ai bấm đăng" (Bot vs đăng tay) — xem câu hỏi mở §7.

## 3. Thiết kế

### 3.1 Định nghĩa "1 bài đã đăng" — chốt trước khi code

| Vấn đề | Quyết định | Lý do |
|--------|-----------|-------|
| Nguồn đếm | `publish_jobs` có `status = 'SUCCESS'` | Gồm cả Bot lẫn đăng tay (manual-post cũng tạo publish_job); 1 content retry nhiều lần chỉ có **1** job SUCCESS/page |
| Mốc thời gian | **`published_at`** (giờ VN), **không** dùng `schedule_time` như tab 2 | Câu hỏi là "đã đăng ngày nào". Job SUCCESS luôn có `published_at`. Ghi chú trên UI để không ai so số 2 tab rồi thắc mắc lệch ±vài bài ở mép ngày |
| Page đã xoá mềm | Bỏ (`p.deleted_at IS NULL`) | Đồng bộ tab 2 |
| Page tạm dừng | **Vẫn tính** | Lịch sử đã đăng là thật |
| Danh mục | `content_assets.category` (text tự do, group thẳng theo chuỗi) | Không có bảng category riêng (plan 14 `topCategoriesBySuccess`) |
| Scope role | Giữ `scopeOwnerId(actor)` sẵn có: CONTENT chỉ thấy bài mình tạo | Không phát minh scope mới |

### 3.2 Endpoint mới

```text
GET /dashboard/publish-report
    ?from=YYYY-MM-DD&to=YYYY-MM-DD      (mặc định 7 ngày gần nhất — resolveDashboardRange)
    &groupBy=day|month                  (mặc định day)
    &pageIds=<uuid>,<uuid>              (bỏ trống = mọi page)
    &categories=<str>,<str>             (bỏ trống = mọi danh mục)
    &mediaType=image|video|all          (mặc định all — tái dùng DashboardMediaType)
```

`@RequirePermission('dashboard:view')` (kế thừa ở class controller). Đây là endpoint **bổ sung
ngoài `docs/04` §8** — ghi rõ ở Swagger summary + contexts.md, không sửa docs.

**DTO** `QueryPublishReportDto extends QueryPostsByPageDto` (đã có `from/to/mediaType`):

- `groupBy`: `@IsIn(['day','month'])`, default `'day'`.
- `pageIds`: `@Transform` tách chuỗi `,` → mảng, `@IsUUID('4', { each: true })`, `@ArrayMaxSize(100)`.
- `categories`: `@Transform` tách `,` + trim, bỏ rỗng, `@IsString({ each: true })`, `@ArrayMaxSize(50)`.
- Range: tái dùng `resolveDashboardRange` (≤ 366 ngày, `from > to` ⇒ 400).

**Response:**

```ts
interface PublishReport {
  range: { from: string; to: string };
  groupBy: 'day' | 'month';
  periods: string[];               // 'YYYY-MM-DD' | 'YYYY-MM' — đã lấp đủ kỳ trống
  totals: { total: number; byPeriod: number[] };   // index khớp periods
  pages: Array<{
    pageId: string; pageName: string;
    total: number; imagePosts: number; videoPosts: number;
    byPeriod: number[];
  }>;                              // sort total DESC, pageName ASC
  categories: Array<{ category: string; total: number; pageCount: number }>;
  scopedToOwnContent: boolean;
}
```

`byPeriod` là **mảng** khớp index với `periods` (không phải object map) — FE dựng cột bảng
trực tiếp, không phải đoán key.

### 3.3 Repository — 2 query raw SQL

```sql
-- (a) page × kỳ
SELECT p.id, p.page_name,
       to_char(j.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh', <'YYYY-MM-DD' | 'YYYY-MM'>) AS period,
       COUNT(*) FILTER (WHERE c.media_type='image')::int AS image_posts,
       COUNT(*) FILTER (WHERE c.media_type='video')::int AS video_posts
  FROM publish_jobs j
  JOIN content_assets c ON c.id = j.content_asset_id
  JOIN facebook_pages p ON p.id = j.facebook_page_id
 WHERE j.status = 'SUCCESS'
   AND j.published_at >= $fromUtc AND j.published_at < $toUtc
   AND p.deleted_at IS NULL
   [AND j.facebook_page_id = ANY($pageIds::uuid[])]
   [AND c.category = ANY($categories::text[])]
   [AND c.media_type = $mediaType]  [AND c.created_by = $ownerId]
 GROUP BY p.id, p.page_name, period;

-- (b) danh mục: cùng WHERE, GROUP BY c.category, COUNT(DISTINCT page)
```

- Format `to_char` chọn bằng **whitelist** trong code (`groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'`),
  truyền qua `Prisma.sql` param — **không** nối chuỗi từ input.
- Timezone lấy từ `config.timezone` (như `listDates`), không hardcode trong SQL.
- Index: `publish_jobs` hiện có `@@index([status])`, `@@index([scheduleTime])` — **chưa có index
  `published_at`**. Dữ liệu MVP nhỏ ⇒ chưa thêm (giữ "không đụng schema"); ghi rủi ro §6.

### 3.4 Service — `getPublishReport(query, actor)`

1. `resolveDashboardRange` → `fromUtc/toUtc`.
2. Sinh `periods`: `day` ⇒ `listDates()` sẵn có; `month` ⇒ hàm mới `listMonths(range, tz)`
   trong `dashboard-range.ts` (tháng đầu/cuối **bị cắt** theo from/to — tháng 11 khi chọn
   15/11–30/11 chỉ đếm 16 ngày, FE ghi chú).
3. Pivot rows SQL (a) → `pages[].byPeriod` lấp 0 cho kỳ trống; tính `totals`.
4. Page được chọn ở filter nhưng **0 bài** trong kỳ ⇒ **vẫn trả 1 dòng toàn 0** (user chọn page
   để hỏi "page này đăng bao nhiêu" — biến mất khỏi bảng là trả lời sai). Cần query phụ lấy
   tên các page đó (`facebookPage.findMany({ id in pageIds, deletedAt: null })`).
5. Không chọn page ⇒ chỉ trả page **có** bài trong kỳ (tránh bảng 50 dòng toàn 0).

### 3.5 Frontend

**`DashboardPage.tsx`** (896 dòng — tách ra cho dễ đọc):

```text
src/pages/DashboardPage.tsx                     # chỉ còn Tabs + PageHeader
src/pages/dashboard/OverviewTab.tsx             # = RealDashboardPage hiện tại, chuyển nguyên
src/pages/dashboard/PublishReportTab.tsx        # MỚI
src/api/dashboard.api.ts                        # + getPublishReport
src/hooks/useDashboard.ts                       # + usePublishReport
src/types/index.ts                              # + PublishReport
```

- `Tabs` `activeKey` sync URL `?tab=report|overview` (giữ được khi F5/chia sẻ link, cùng kiểu
  `useSearchParams` đang dùng cho range). Tab không active **không mount** ⇒ không gọi API thừa.
- Mock mode (`VITE_USE_MOCK`): tab 1 tính từ `useMockData().publishJobs` giống `MockDashboardPage`
  (ADR-005 — không được xoá mock).

**Bố cục tab "Thống kê đăng bài":**

```text
┌ Bộ lọc ─────────────────────────────────────────────────────────────┐
│ [Page ▾ multi, search]  [Danh mục ▾ multi]  [Ảnh/Video/Tất cả]     │
│ [RangePicker + preset: Hôm nay · 7 ngày · Tháng này · Tháng trước]  │
│ Xem theo: (•) Ngày ( ) Tháng                                         │
└──────────────────────────────────────────────────────────────────────┘
[Tổng bài: 128] [Số page có đăng: 6] [TB/ngày: 18.3] [Danh mục: 9]

┌ Số bài đã đăng theo page ───────────────────────────────────────────┐
│ Page        │ Tổng │ Ảnh │ Video │ 01/11 │ 02/11 │ ... (scroll ngang)│
│ Page A      │  40  │ 10  │  30   │   6   │   5   │                   │
│ ...                                                                  │
│ TỔNG        │ 128  │     │       │  19   │  17   │   (summary row)   │
└──────────────────────────────────────────────────────────────────────┘
┌ Theo danh mục ─────────────┐  ┌ Chart cột chồng theo kỳ (tuỳ chọn) ┐
│ Danh mục │ Số bài │ Số page │  │ stack theo page, top 5 + "Khác"    │
└────────────────────────────┘  └────────────────────────────────────┘
```

- Ô Page: `usePages()` sẵn có (mọi page chưa xoá, kể cả tạm dừng — gắn Tag "Tạm dừng").
- Ô Danh mục: `GET /content-assets/categories` sẵn có.
- Bảng: AntD `Table` `scroll={{ x: 'max-content' }}`, cột Page `fixed: 'left'`, `summary` cho dòng TỔNG.
  Ô = 0 hiện `–` mờ cho dễ nhìn.
- `groupBy=day` mà khoảng > 62 ngày ⇒ gợi ý (không ép) chuyển "Tháng".
- Chart: dùng lib chart đang có trong `DashboardPage` (không thêm dependency).
- Ghi chú nhỏ dưới tiêu đề: *"Đếm bài đăng thành công theo thời điểm đăng thực tế (giờ VN)."*

### 3.6 Filter Mới/Cũ (chỉ khi plan 36 đã xong)

Thêm `isSourceNew?: boolean` vào DTO + `[AND c.is_source_new = $x]` + Select "Tất cả/Mới/Cũ"
trên FE. Nếu plan 36 chưa xong khi làm plan này ⇒ bỏ qua, ghi task vào plan 36.

## 4. Task

**Backend**
- [x] `QueryPublishReportDto` (groupBy, pageIds, categories — parse chuỗi `,` + validate)
- [x] `listMonths()` trong `dashboard-range.ts`
- [x] `DashboardRepository.publishReportByPagePeriod()` + `publishReportByCategory()` + `findPagesByIds()`
- [x] `DashboardService.getPublishReport()` (pivot, lấp 0, page chọn mà 0 bài)
- [x] `GET /dashboard/publish-report` + Swagger
- [x] Test `dashboard-range.spec.ts`: `listMonths` (cắt tháng đầu/cuối, qua năm, 1 ngày)
- [x] Test `dashboard.service.spec.ts`: pivot đúng index, lấp 0, page chọn 0 bài vẫn có dòng,
      không chọn page thì không có dòng 0, CONTENT bị scope `ownerId`, totals = Σ pages
- [x] Smoke SQL thật trên DB dev (2 query + findReportPages chạy được, tổng theo ngày = theo tháng). *Chưa có bài đăng sát nửa đêm trong DB dev để soi mép ngày — logic `AT TIME ZONE` dùng chung khuôn `dailyJobStats` đã chạy prod.*

**Frontend**
- [x] Tách `DashboardPage` → `Tabs` + `OverviewTab` (chuyển nguyên, không đổi hành vi)
- [x] `dashboard.api.ts` + `usePublishReport` + type `PublishReport`
- [x] `PublishReportTab`: bộ lọc, 4 thẻ số, bảng pivot + summary, bảng danh mục, chart
- [x] Tab sync `?tab=`; mock mode cho tab mới

**Chung**
- [x] `npm run lint && npm run build` xanh BE + FE; `npm run test` BE
- [ ] Bấm tay UI thật: lọc 1 page / nhiều page / 1 danh mục / theo tháng, so số với DB
- [ ] Cập nhật `contexts.md` (§1, §4, §5) + thêm dòng plan 35 vào `PLAN-MVP.md`

## 5. Điều kiện nghiệm thu

- [ ] Chọn Page A + "Tháng này" + Xem theo Ngày ⇒ thấy số bài từng ngày của Page A, khớp
      `SELECT count(*) FROM publish_jobs WHERE status='SUCCESS' ...` theo giờ VN.
- [ ] Đổi sang "Tháng", range 3 tháng ⇒ 3 cột tháng, tổng không đổi so với xem theo ngày.
- [ ] Chọn danh mục X ⇒ chỉ đếm bài category X; bảng danh mục chỉ còn X.
- [ ] Chọn page không đăng bài nào trong kỳ ⇒ vẫn hiện dòng đó với toàn `–`/0.
- [ ] Tab 2 "Tổng quan" hiển thị và hoạt động y như trước khi refactor.
- [ ] F5 khi đang ở tab 1 ⇒ vẫn ở tab 1 với đúng bộ lọc.
- [ ] Login CONTENT ⇒ chỉ thấy số bài của chính mình.

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Số tab 1 lệch tab 2 (`published_at` vs `schedule_time`) | Ghi chú trên UI + contexts.md; chỉ lệch ở mép ngày với job đăng trễ |
| Không có index `published_at` ⇒ chậm khi `publish_jobs` lớn | MVP chấp nhận; khi > ~200k dòng thêm `@@index([status, publishedAt])` (migration + erd.md) |
| 366 cột ngày làm bảng nặng | Gợi ý chuyển Tháng khi > 62 ngày; AntD Table virtual nếu cần |
| `category` gõ tay lệch hoa/thường ("Hài" vs "hài") ⇒ tách 2 dòng | Không chuẩn hoá ở plan này (ngoài phạm vi); ghi §6 contexts nếu user phản ánh |
| Refactor tách file làm hỏng tab cũ | Chuyển nguyên code, không sửa logic; bấm tay tab 2 trong nghiệm thu |

---

## 7. Câu hỏi mở (chốt với user trước khi code)

1. Tab nào **mở mặc định** khi vào `/dashboard`? (Đề xuất: tab "Tổng quan" như hiện tại; tab
   "Thống kê đăng bài" đứng đầu thanh tab nhưng không active mặc định.)
2. "User admin đã đăng" = **mọi bài đăng thành công** (Bot + đăng tay), hay cần tách/lọc riêng
   bài đăng tay theo người bấm? (Đề xuất: đếm tất cả; tách theo người đăng để plan sau.)

## 8. Kết quả (điền khi xong)

- **Ngày xong:** code 2026-11-01 (chờ bấm tay UI thật)
- **File chính:** BE `backend/src/modules/dashboard/{dashboard.service,dashboard.repository,dashboard-range,dashboard.controller}.ts`,
  `dto/query-dashboard.dto.ts`; FE `frontend/src/pages/DashboardPage.tsx` (chỉ còn Tabs),
  `frontend/src/pages/dashboard/{PublishReportTab,OverviewTab}.tsx`
- **Khác thiết kế ban đầu:**
  - Câu hỏi mở §7 chưa được trả lời ⇒ code theo đề xuất trong mockup user đã duyệt:
    tab **"Thống kê đăng bài" mở mặc định** (đứng đầu), tab cũ đổi tên "Tổng quan hệ thống";
    đếm **mọi** bài SUCCESS (Bot + đăng tay). Đổi tab mặc định = 1 dòng trong `DashboardPage.tsx`.
  - Repository dùng tên `findReportPages()` thay cho `findPagesByIds()`.
  - Response thêm `isPaused` / `totals.imagePosts` / `totals.videoPosts` để FE vẽ tag "Tạm dừng" + dòng TỔNG.
  - Bộ lọc tab 1 lưu URL với tiền tố `r` (`rFrom`, `rTo`, `rPages`, `rCats`, `rMedia`, `rGroup`) để
    không đè `from`/`to` của tab 2; tab 2 đổi kỳ giờ giữ các param khác (trước đây ghi đè cả URL).
  - Chart dùng recharts sẵn có (BarChart stack), không thêm dependency.
- **Test:** BE +9 test (6 `getPublishReport`, 3 `listMonths`) — dashboard 39/39 xanh. FE: chưa viết test (không bắt buộc).
- **Còn nợ:** bấm tay UI thật (§5); filter Mới/Cũ chờ plan 36.
