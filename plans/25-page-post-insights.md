# Plan 25 — Tracking lượt xem bài đã đăng (Facebook Post Insights)

**Milestone:** M11 (Phase 2)
**Trạng thái:** 🟡 code + test xong 2026-08-08; **đã đo Graph thật và sửa 3 lỗi (§8)**; còn nợ test tay trên UI
**Phụ thuộc:** [DONE/05-facebook-pages.md](./DONE/05-facebook-pages.md) (page + token mã hoá) ·
[DONE/07-autopost-engine.md](./DONE/07-autopost-engine.md) (`content_page_assignments.facebook_post_id`) ·
[15-facebook-login-connect.md](./15-facebook-login-connect.md) (OAuth scope)
**Spec tham chiếu:** `docs/07-facebook-publisher.md` · `docs/05-rbac.md` §2

---

## 0. Ràng buộc cứng (user chốt 2026-08-08)

### 0.1 CHỈ lấy bài do tool đăng — cấm crawl page

**Không** gọi edge `/{page-id}/posts` để liệt kê bài. Nguồn duy nhất của danh sách bài
cần tracking là **DB của chính hệ thống**: `content_page_assignments` có
`published_at != null` **và** `facebook_post_id != null`.

Lý do bảng này là nguồn chuẩn (không phải `publish_jobs`):

- `UNIQUE(content_asset_id, facebook_page_id)` ⇒ **không bao giờ trùng dòng**, trong khi
  một content retry nhiều lần có thể sinh nhiều `publish_jobs`.
- Cả 2 đường đăng đều ghi vào đây: Bot ([publish-jobs.repository.ts:269](../backend/src/modules/publish-jobs/publish-jobs.repository.ts#L269))
  và đăng tay ([manual-post.repository.ts:95](../backend/src/modules/manual-post/manual-post.repository.ts#L95)).

Hệ quả: bài đăng thủ công **trực tiếp trên Facebook** (không qua tool) sẽ **không** xuất
hiện trong màn tracking. Đây là hành vi đúng theo yêu cầu, không phải thiếu sót — ghi rõ
một dòng trên UI để user không hiểu nhầm là mất bài.

### 0.2 Gọi đúng tên chỉ số, không gộp thành chữ "view" mơ hồ

Mỗi cột trên UI phải nói rõ nó đo cái gì. Cấm gộp nhiều chỉ số thành một chữ "View"
rồi sau này không ai biết số đó là gì.

⚠️ **Cập nhật sau khi đo thật (§8.1):** Facebook **không còn** trả impressions/reach
tổng cho bài. Ba cột hiện dùng là *Lượt xem video* (`post_video_views`, chỉ bài
video), *Tiếp cận người theo dõi* (`post_fan_reach` — **không phải** reach tổng) và
*Lượt nhấp* (`post_clicks`).

---

## 1. Mục tiêu

Sau feature này, với mỗi Facebook Page, user mở được **màn chi tiết riêng** liệt kê toàn
bộ bài **do tool đăng lên page đó** — mới nhất trước — kèm lượt hiển thị, người tiếp cận,
lượt xem video, like/comment/share; và bấm được thẳng sang bài gốc trên Facebook.

Số liệu do một **job đồng bộ định kỳ** kéo về từ Graph API và lưu lại theo ngày, nên xem
được cả xu hướng chứ không chỉ con số tại thời điểm mở màn hình.

---

## 2. Ngoài phạm vi

- **Không** crawl bài không do tool đăng (§0.1).
- **Không** làm biểu đồ/chart ở lần này — chỉ bảng số. (Ghi §6 nếu muốn làm sau.)
- **Không** làm insight cấp Page (fan growth, page views) — chỉ cấp **post**.
- **Không** làm Story insights (hết hạn 24h, cần luồng gấp riêng).
- **Không** export CSV/Excel.
- **Không** đụng tới luồng đăng bài hiện có — feature này **chỉ đọc**.

---

## 3. Thiết kế

### 3.1 Quyền Facebook — thêm đúng 1 scope

`pages_read_engagement` **không** mở được edge `/insights`. Thiếu `read_insights` ⇒ Graph
trả `(#200) Requires read_insights permission`.

Sửa [facebook-connect.service.ts:36](../backend/src/modules/facebook-pages/facebook-connect.service.ts#L36):

```ts
const OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'read_insights',        // ← plan 25
];
```

**Cạm bẫy lớn nhất của plan này:** token đã cấp **giữ nguyên scope cũ vĩnh viễn**. Mọi
connection tạo trước plan 25 sẽ **không** có `read_insights` và **không** tự nâng cấp.
Bắt buộc phải có đường re-consent tường minh (§3.6), nếu không job sẽ fail hàng loạt mà
user không hiểu tại sao.

**App Review:** `read_insights` cần Advanced Access + Business Verification **nếu** mở cho
user ngoài. Với Page mà tài khoản có role trong Meta app (Admin/Dev/Tester) thì Standard
Access chạy được ngay — đủ để code và nghiệm thu. Ghi việc nộp review vào `contexts.md` §6,
**không** chặn plan này.

### 3.2 Metric lấy về — ⚠️ **ĐÃ LỖI THỜI, xem §8**

> Mục này giữ nguyên làm dấu vết của giả định ban đầu. Đo thật ngày 2026-08-08 cho
> thấy `post_impressions*` **đã bị Meta gỡ hẳn**. Metric đang dùng thật nằm ở **§8.1**.

| Loại bài | Metric (GIẢ ĐỊNH BAN ĐẦU — SAI) |
|---|---|
| Ảnh / text / album | `post_impressions`, `post_impressions_unique` |
| Video / Reels | thêm `post_video_views` |
| Engagement (không cần insights) | `likes.summary(true)`, `comments.summary(true)`, `shares` |

⚠️ **Tên metric đổi giữa các Graph version** và Meta đang hợp nhất Impressions → "Views".
Metric đã deprecate **không ném lỗi mà trả mảng rỗng** ⇒ dễ tưởng bài 0 view.

Task bắt buộc **trước khi code**: chạy 1 call thật trên Graph API Explorer đúng version
đang pin (`META_GRAPH_API_VERSION=v21.0`, [.env.example:54](../backend/.env.example#L54)) để
chốt danh sách metric còn sống. Adapter phải **phân biệt** "metric trả 0" với "metric
không tồn tại" và log cảnh báo cho trường hợp thứ hai.

### 3.3 Bảng mới — ⚠️ **cột đã đổi, xem §8.1 và `erd.md`**

Hai bảng — tách "số hiện tại" khỏi "lịch sử theo ngày" để màn danh sách chỉ cần 1 join,
không phải `DISTINCT ON` trên bảng lịch sử mỗi lần render.

```prisma
/// Số liệu MỚI NHẤT của một bài đã đăng. 1-1 với assignment.
model PostInsight {
  id                String   @id @default(uuid()) @db.Uuid
  assignmentId      String   @unique @map("assignment_id") @db.Uuid
  facebookPostId    String   @map("facebook_post_id")
  impressions       Int      @default(0)
  impressionsUnique Int      @default(0) @map("impressions_unique")
  videoViews        Int?     @map("video_views")   // null = bài không phải video
  likeCount         Int      @default(0) @map("like_count")
  commentCount      Int      @default(0) @map("comment_count")
  shareCount        Int      @default(0) @map("share_count")
  /// Lần đồng bộ thành công gần nhất.
  fetchedAt         DateTime @map("fetched_at")
  /// != null = Graph báo bài không còn tồn tại ⇒ NGỪNG đồng bộ, không retry mãi.
  missingOnFbAt     DateTime? @map("missing_on_fb_at")
  syncErrorMessage  String?  @map("sync_error_message") @db.Text
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  assignment ContentPageAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)

  @@index([facebookPostId])
  @@map("post_insights")
}

/// Ảnh chụp mỗi ngày — để xem xu hướng và biết bài "nguội" chưa.
model PostInsightSnapshot {
  id                String   @id @default(uuid()) @db.Uuid
  assignmentId      String   @map("assignment_id") @db.Uuid
  /// 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh — giống quy ước slot_runs.run_date.
  snapshotDate      String   @map("snapshot_date")
  impressions       Int      @default(0)
  impressionsUnique Int      @default(0) @map("impressions_unique")
  videoViews        Int?     @map("video_views")
  createdAt         DateTime @default(now()) @map("created_at")

  assignment ContentPageAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)

  @@unique([assignmentId, snapshotDate]) // chạy 4 lần/ngày vẫn chỉ 1 dòng/ngày (upsert)
  @@map("post_insight_snapshots")
}
```

`ContentPageAssignment` thêm 2 relation ngược (`insight`, `insightSnapshots`).

> **Rule 05:** sửa schema ⇒ cập nhật [`erd.md`](../erd.md) **trong cùng thay đổi**, kèm
> bảng Index, bảng Enum (plan này không thêm enum) và dòng Lịch sử thay đổi. Chưa cập nhật
> ERD = task **chưa Done**.

### 3.4 Adapter — `infra/facebook/`

Thêm vào interface `FacebookGraph` ([facebook-graph.interface.ts](../backend/src/infra/facebook/facebook-graph.interface.ts))
hoặc tách client riêng `facebook-insights.client.ts` (ưu tiên tách — file graph client đã
dài, và insights là mối quan tâm khác hẳn OAuth):

```ts
export interface FacebookPostInsight {
  postId: string;
  impressions: number;
  impressionsUnique: number;
  videoViews: number | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

export interface FacebookPostInsightError {
  postId: string;
  /** true = bài không còn trên FB ⇒ caller set missingOnFbAt, ngừng đồng bộ. */
  isMissing: boolean;
  message: string;
}

export interface FacebookInsights {
  /** Tối đa 50 postId/lần. Trả cả phần thành công lẫn phần lỗi — KHÔNG throw cả lô. */
  getPostInsights(
    postIds: string[],
    pageAccessToken: string,
  ): Promise<{ ok: FacebookPostInsight[]; failed: FacebookPostInsightError[] }>;
}
```

**Dùng Graph Batch API** (`POST /` với `batch=[...]`), 50 post/request:

```
POST https://graph.facebook.com/v21.0/
  access_token={page_token}
  batch=[{"method":"GET","relative_url":"{postId}?fields=insights.metric(post_impressions,post_impressions_unique),likes.summary(true),comments.summary(true),shares"}, ...]
```

Hai điểm bắt buộc:

1. **Batch theo từng page** — mỗi page một token riêng, không trộn.
2. **Parse từng phần tử batch riêng.** Mỗi phần tử có `code` độc lập: bài bị xoá trả
   `code: 400` trong khi 49 bài còn lại `200`. Coi cả lô là fail ⇒ mất sạch dữ liệu vì
   1 bài hỏng. Đây là lỗi kinh điển khi dùng Batch API.

Lỗi Graph wrap thành domain error theo rule 01, không ném axios error ra ngoài.

### 3.5 Job đồng bộ

`InsightsSyncService` + cron (dùng lại khuôn `@nestjs/schedule` của auto-post engine).

**Chiến lược tần suất theo tuổi bài** — view bão hoà rất nhanh, quét đều mọi bài là lãng phí:

| Tuổi bài (từ `published_at`) | Tần suất |
|---|---|
| < 48 giờ | 4 lần/ngày (mỗi 6h) |
| 2–7 ngày | 1 lần/ngày |
| 8–30 ngày | 2 ngày/lần |
| > 30 ngày | **ngừng** — chốt số cuối |

Điều kiện chọn bài để đồng bộ:
- `published_at != null` AND `facebook_post_id != null`
- page `deleted_at IS NULL` (page đã xoá thì thôi; page `is_active = false` **vẫn** đồng bộ
  — tạm dừng đăng không có nghĩa là bỏ theo dõi bài cũ)
- `post_insights.missing_on_fb_at IS NULL`
- đến hạn theo bảng trên

Mỗi lượt chạy: gom theo `facebook_page_id` → chia lô 50 → gọi batch → upsert
`post_insights` + upsert `post_insight_snapshots` theo `(assignment_id, snapshot_date)`.

Token thiếu `read_insights` ⇒ **skip cả page**, ghi `sync_error_message` một lần, **không**
đốt 50 call chỉ để nhận 50 lỗi giống nhau.

**Cho phép đồng bộ tay:** nút "Đồng bộ ngay" trên màn chi tiết (§3.7) gọi
`POST /pages/:id/insights/sync`, có **throttle 5 phút/page** để user bấm liên tục không
đập vào rate limit.

### 3.6 Cảnh báo thiếu scope (bắt buộc, không phải nice-to-have)

- Thêm `SCOPE_READ_INSIGHTS = 'read_insights'` cạnh `SCOPE_MANAGE_POSTS`
  ([facebook-pages.service.ts:27](../backend/src/modules/facebook-pages/facebook-pages.service.ts#L27)).
- Kiểm qua `debugToken().scopes` — cơ chế đã có sẵn, chỉ thêm cờ.
- API page trả thêm `canReadInsights: boolean`.
- UI: page thiếu scope hiện Tag vàng **"Chưa cấp quyền đọc thống kê"** + nút **"Kết nối
  lại"**; màn chi tiết hiện Alert thay vì bảng rỗng khó hiểu.

### 3.7 API mới

Module `src/modules/post-insights/`, permission **`pages:manage`** (dùng lại — ai quản lý
page thì xem được thống kê page đó; không thêm permission mới để khỏi phải sửa ma trận
`docs/05-rbac.md`).

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/pages/:pageId/insights/posts` | Danh sách bài đã đăng của page + số liệu. Query: `page`, `pageSize`, `sort` (mặc định `publishedAt:desc`), `mediaType`, `from`, `to` |
| `GET` | `/pages/:pageId/insights/summary` | Tổng: số bài, tổng hiển thị, tổng tiếp cận, TB hiển thị/bài, lần đồng bộ gần nhất |
| `POST` | `/pages/:pageId/insights/sync` | Đồng bộ ngay (throttle 5 phút) |

Response một dòng bài:

```ts
{
  assignmentId, contentAssetId, facebookPostId,
  title, mediaType, thumbnailUrl,
  publishedAt,
  impressions, impressionsUnique, videoViews,
  likeCount, commentCount, shareCount,
  fetchedAt,                       // null = chưa đồng bộ lần nào
  missingOnFb: boolean,
  facebookPostUrl,                 // https://facebook.com/{postId}
}
```

`facebookPostUrl` **dựng ở backend mapper**, không để FE tự nối chuỗi — format
`{pageId}_{postId}` là chi tiết của Graph API, FE không nên biết.

### 3.8 Frontend

**a) `PageManagementPage` — sửa tại chỗ, không thêm menu mới**

- Cột "Tên Page" ([PageManagementPage.tsx:426](../frontend/src/pages/PageManagementPage.tsx#L426)):
  render thành link `https://facebook.com/{pageId}`, `target="_blank"`,
  `rel="noopener noreferrer"`, kèm icon `<LinkOutlined />`.
- Cột Actions: thêm nút **"Chi tiết"** (icon `<BarChartOutlined />`) → `/pages/:id/insights`.
- Thêm cột gọn **"Bài đã đăng"** (số bài) để user biết page nào có gì trước khi bấm vào.

**b) Màn mới `PageInsightsPage` — route `/pages/:pageId/insights`**

Đăng ký trong [App.tsx:65](../frontend/src/App.tsx#L65) **bên trong** `RoleRoute path="/pages"`
đang có — dùng lại đúng luật quyền của màn Pages, không khai báo route quyền mới.

Bố cục:

1. **Header**: tên page (link ra Facebook) · nút "Quay lại" · nút "Đồng bộ ngay" ·
   dòng chữ nhỏ *"Chỉ hiển thị bài đăng qua tool này"* (§0.1) · "Cập nhật lúc HH:mm".
2. **4 thẻ số** (`Statistic`): Tổng bài · Tổng lượt hiển thị · Tổng người tiếp cận ·
   TB hiển thị/bài.
3. **Bảng bài đăng** — mặc định sort `publishedAt` **giảm dần** (mới nhất trước):

| Cột | Ghi chú |
|---|---|
| Thumbnail | ảnh nhỏ 48px |
| Tiêu đề | link ra bài gốc trên Facebook (`facebookPostUrl`) |
| Loại | Tag ảnh/video |
| Đăng lúc | `DD/MM/YYYY HH:mm`, **sortable, mặc định desc** |
| Lượt hiển thị | sortable |
| Người tiếp cận | sortable |
| Lượt xem video | chỉ hiện khi bài là video, còn lại `—` |
| Tương tác | `👍 n · 💬 n · ↗ n` |
| Cập nhật | thời gian tương đối ("2 giờ trước") |

Trạng thái đặc biệt phải hiển thị rõ, không để ô trống:
- chưa đồng bộ lần nào ⇒ `—` + tooltip *"Chưa đồng bộ"* (khác hẳn 0 view)
- `missingOnFb` ⇒ Tag đỏ *"Bài đã bị xoá trên Facebook"*, số liệu hiện dạng mờ
- page thiếu `read_insights` ⇒ `Alert` cảnh báo + nút "Kết nối lại", ẩn 4 thẻ số

**c) API layer + hook** theo rule 01: `src/api/postInsights.api.ts` +
`src/hooks/usePostInsights.ts`. Mutation "Đồng bộ ngay" phải `invalidateQueries` key của
cả danh sách lẫn summary.

---

## 4. Task

### Chuẩn bị
- [x] **ĐÃ LÀM 2026-08-08 — và phát hiện §3.2 SAI:** đo thật trên Graph, `post_impressions` đã bị Meta gỡ ở mọi version v19→v23. Đổi sang `post_video_views` / `post_fan_reach` / `post_clicks`. Chi tiết + 2 lỗi code kèm theo: **§8**
- [x] Thêm `read_insights` vào `OAUTH_SCOPES` — [facebook-connect.service.ts:36](../backend/src/modules/facebook-pages/facebook-connect.service.ts#L36)
- [ ] **CÒN NỢ:** xác nhận màn consent Facebook thật hiện dòng "Read Insights"

### Backend
- [x] `schema.prisma`: `PostInsight`, `PostInsightSnapshot`, 2 relation ngược trên `ContentPageAssignment`
- [x] **Cập nhật `erd.md`** (2 bảng + 3 index + 4 ràng buộc + Lịch sử thay đổi) — làm **trước** migrate
- [x] `npx prisma migrate dev --name post_insights` ⇒ `20260808054704_post_insights`
- [x] `infra/facebook/facebook-insights.client.ts` + `facebook-insights.interface.ts` + đăng ký DI
- [x] Module `post-insights/`: repository · service · controller · dto · mapper
- [x] `canReadInsights` + `publishedPostCount` trong response page + hằng `SCOPE_READ_INSIGHTS` (§3.6)
- [x] `InsightsSyncService` + cron `0 */6 * * *` theo tầng tuổi bài (§3.5)
- [x] Throttle 5 phút cho `POST /pages/:id/insights/sync` (429 khi gọi sớm)

### Frontend
- [x] `postInsights.api.ts` + `usePostInsights.ts` + type trong `src/types/`
- [x] `PageManagementPage`: tên page thành link FB · nút "Chi tiết" · cột "Bài đã đăng" · Tag cảnh báo thiếu scope
- [x] `PageInsightsPage` + route trong `App.tsx` (trong `RoleRoute path="/pages"`)
- [x] 3 trạng thái đặc biệt: chưa đồng bộ (`—` + tooltip) · bài bị xoá (Tag đỏ) · thiếu scope (Alert + khoá nút)

### Test (rule 02 — vùng phức tạp/dễ sai)
- [x] **Parse batch response**: 1 phần tử lỗi giữa lô ⇒ 2 phần tử còn lại vẫn được lưu
- [x] **Metric deprecate** (Graph trả `data: []`) ⇒ trả `null` chứ không phải 0, có log cảnh báo; service chuyển `null` nguyên xuống repository, repository bỏ field khỏi `update`
- [x] **Bài không tồn tại** ⇒ `markMissing` (không phải `recordSyncError`); repository lọc `missing_on_fb_at IS NULL` nên lần sau không chọn lại
- [x] **Chia lô**: 137 bài ⇒ đúng 3 batch (50/50/37)
- [x] **Tầng tuổi bài**: 8 test cho 4 tầng bằng **clock giả**, gồm ca "bài 3 ngày đồng bộ 7h trước ⇒ CHƯA tới hạn" (khác hẳn bài mới)
- [x] **Token thiếu scope** ⇒ skip cả page, đúng **0** call Graph
- [x] `canReadInsights`: true/false/null (dán tay)/null (đã thu hồi)
- [x] Mapper: `null` (chưa đo) khác `0` (đã đo, thật sự 0) — cả 2 chiều
- [ ] **Snapshot idempotent** — *không unit test được*: đây là UNIQUE `(assignment_id, snapshot_date)` + `upsert`, chỉ chứng minh được bằng DB thật. Đã kiểm gián tiếp (service truyền `snapshotDate` đúng múi giờ VN); còn nợ smoke DB
- [x] `npm run lint && npm run build && npm run test` xanh cả BE (880) lẫn FE (63)

### Đóng gói
- [x] `.env.example`: **không** thêm biến mới (dùng lại `META_GRAPH_API_VERSION`)
- [x] Cập nhật `contexts.md` + §6 cho việc nộp App Review `read_insights`
- [x] Cập nhật `PLAN-MVP.md` §2 (thêm dòng M11)

### Còn lại để đóng plan
- [ ] Test tay trên UI thật + Page thật (điều kiện nghiệm thu §5)
- [ ] Nộp App Review `read_insights` nếu mở cho user ngoài team

---

## 5. Điều kiện nghiệm thu

- [ ] Kết nối lại 1 page bằng Facebook Login → màn consent **hiện mục "Read Insights"**
- [ ] `/pages`: tên page bấm được, mở đúng page trên Facebook ở tab mới
- [ ] `/pages`: nút "Chi tiết" mở `/pages/:id/insights`
- [ ] Màn chi tiết: bài **mới nhất nằm trên cùng** khi vừa mở, không cần bấm sort
- [ ] Bấm tiêu đề bài → mở **đúng bài đó** trên Facebook
- [ ] Bấm "Đồng bộ ngay" → số lượt hiển thị đổi/được điền, "Cập nhật lúc" nhảy
- [ ] Số hiển thị trên UI **khớp** với Meta Business Suite của cùng bài (sai lệch nhỏ do độ trễ là chấp nhận được)
- [ ] Page chưa cấp `read_insights` ⇒ thấy Alert + nút "Kết nối lại", **không** thấy bảng rỗng vô nghĩa
- [ ] Xoá 1 bài trên Facebook → lần đồng bộ sau bài đó có Tag "đã bị xoá", các bài khác vẫn cập nhật bình thường
- [ ] **Test tay trên UI thật** (rule 00 — từ M3 trở đi bắt buộc)

---

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| **Token cũ không có `read_insights`, không tự nâng cấp** | §3.6: cờ `canReadInsights` + cảnh báo UI + nút "Kết nối lại". Đây là rủi ro số 1 của plan này |
| Metric bị deprecate ⇒ trả `[]` chứ không lỗi, tưởng bài 0 view | Chốt metric bằng call thật trước khi code; adapter phân biệt "0" với "không có metric"; không ghi đè số cũ bằng 0 |
| 1 bài hỏng làm hỏng cả batch 50 bài | Parse từng phần tử batch riêng (§3.4) — có test bắt buộc |
| `read_insights` chưa được App Review duyệt | Standard Access đủ cho page có role trong app ⇒ code + nghiệm thu được ngay; ghi nợ review vào `contexts.md` §6 |
| Rate limit Graph | Batch 50 + tầng tuổi bài + throttle nút đồng bộ. Rủi ro thấp vì chỉ quét bài của tool, không paging edge |
| Số trên UI lệch Business Suite | Meta trễ 15 phút–vài giờ; hiện rõ "Cập nhật lúc" để user hiểu đây là snapshot, không phải realtime |
| Bảng snapshot phình to | 1 dòng/bài/ngày, dừng ghi sau 30 ngày ⇒ có trần. Cron dọn snapshot > 1 năm nếu cần (ghi §6, chưa làm) |

---

## 8. Đo Graph API thật — 2026-08-08 (SỬA GIẢ ĐỊNH CỦA §3.2)

Chạy thử lần đầu ra "mọi chỉ số = 0". Điều tra bằng cách gọi thẳng Graph với Page
token thật, phát hiện **3 lỗi**, trong đó 2 lỗi do code của plan này.

### 8.1 `post_impressions` KHÔNG CÒN TỒN TẠI

Giả định ở §3.2 sai. Đo thật với token `type=PAGE`, `is_valid=true`, `expires_at=0`,
scope có đủ `read_insights`:

```
post_impressions          ✗ (#100) The value must be a valid insights metric
post_impressions_unique   ✗    post_impressions_organic  ✗    post_impressions_paid ✗
post_reach ✗   post_views ✗   post_engaged_users ✗   page_impressions ✗
```

Thử lại trên **v19.0 · v20.0 · v21.0 · v22.0 · v23.0** — **tất cả** đều trả cùng
lỗi ⇒ Meta đã **gỡ hẳn**, không phải chuyện pin sai version, cũng không phải thiếu
quyền (token có `read_insights`).

**Chỉ số còn đọc được** (đã đo, có thật):

| Metric | Ý nghĩa | Áp dụng |
|---|---|---|
| `post_video_views` | lượt xem video | chỉ bài video |
| `post_fan_reach` | số **người theo dõi page** đã thấy bài | mọi bài |
| `post_clicks` | lượt nhấp vào bài | mọi bài |
| `likes`/`comments`/`shares` (field thường) | tương tác | mọi bài |

**Hệ quả nghiệp vụ (user đã chốt):** bài **ảnh** không còn cách nào lấy "lượt xem /
lượt hiển thị tổng" qua API. Con số "Lượt xem" mà Meta Business Suite hiển thị đi
qua API nội bộ của Meta, **không** mở cho app bên thứ ba. Màn hình đổi sang 3 cột
*Lượt xem video · Tiếp cận người theo dõi · Lượt nhấp* và nói rõ giới hạn này ngay
dưới header.

### 8.2 Lỗi: code 100 bị hiểu thành "bài đã bị xoá" — **làm hỏng dữ liệu**

`MISSING_OBJECT_CODES = {100, 803}` ở §3.4 sai. Graph dùng **cùng** code 100 cho
"tên metric không hợp lệ". Hậu quả thật: **3 bài đang sống** bị ghi
`missing_on_fb_at` ⇒ repository lọc `missing_on_fb_at IS NULL` nên chúng **vĩnh
viễn** không bao giờ được đồng bộ lại, im lặng, không ai biết.

**Sửa:** chỉ set `missingOnFbAt` khi Graph trả `error_subcode = 33`. Cấm suy từ
`code` trần. Thêm cờ `isInvalidMetric` để service dừng **cả page** và log một dòng
lỗi chỉ đúng chỗ cần sửa, thay vì rắc 50 message giống nhau lên 50 dòng.

**Dọn dữ liệu:** xoá 4 dòng `post_insights` hỏng (3 dòng bị đánh dấu xoá oan, 1
dòng lỗi quyền) + toàn bộ snapshot. Không mất dữ liệu thật — cả 4 đều là lỗi.

### 8.3 Lỗi: `?? 0` ở nhánh `create` — nguồn gốc của "view = 0"

`saveInsight()` viết `impressions: data.impressions ?? 0` trong `create`. Nhánh
`update` xử lý `null` đúng, nhưng **lần đồng bộ đầu tiên** luôn đi vào `create` ⇒
ghi thẳng `0` vào DB kèm `fetched_at`, nên UI hiện "đã đồng bộ, 0 lượt xem" cho bài
chưa hề lấy được số. Đúng triệu chứng user báo.

**Sửa:** mọi cột số chuyển sang **NULLABLE, bỏ `DEFAULT 0`**; `saveInsight()` bỏ hẳn
field khỏi payload khi giá trị là `null` — cả `create` lẫn `update`. Bất biến
"`NULL` = chưa đo, `0` = đo được 0" giờ được **DB** bảo đảm, không chỉ bằng quy ước.

### 8.4 Prod vẫn lỗi metric trong khi dev xanh ⇒ **bỏ danh sách metric cứng**

Sau khi sửa §8.1, máy dev chạy tốt nhưng **prod vẫn báo "Facebook không chấp nhận
chỉ số đang dùng"**. Cùng code, cùng `META_GRAPH_API_VERSION=v21.0` ⇒ khác biệt nằm
ở **page**: Meta cấp bộ metric khác nhau giữa page "New Page Experience" và page
cũ. Nói cách khác **mọi danh sách metric hard-code đều sẽ hỏng ở page nào đó**.

**Sửa gốc — adapter tự dò và thích nghi** (`FacebookInsightsClient`):

1. Lượt 1 hỏi đủ metric như bình thường.
2. Nếu Graph chê metric (Graph **không** nói metric nào), gửi thêm **1** request
   batch hỏi **từng metric một** trên đúng 1 bài để biết cái nào bị từ chối.
3. Ghi nhớ metric hỏng theo **từng page** (`Map<pageId, Set<metric>>` — hỏng ở page
   A không suy ra hỏng ở page B), rồi **thử lại** những bài đã lỗi.
4. Lần gọi sau không hỏi lại metric đã biết hỏng.
5. Page không hỗ trợ metric nào ⇒ **bỏ hẳn khối `insights`** khỏi request (gửi
   `insights.metric()` rỗng là cú pháp sai, trượt cả bài) nhưng **vẫn lấy
   like/comment/share** — chúng là field thường, không cần `read_insights`.

Chi phí: đúng 1 request dò cho mỗi page, chỉ khi đã có lỗi. Đổi lại màn thống kê
không bao giờ trống trơn chờ người sửa code. 6 test phủ: loại-rồi-thử-lại · không
hỏi lại metric đã loại · cache tách theo page · hết metric vẫn lấy được tương tác.

### 8.5 Xác minh sau khi sửa

Chạy lại với Graph thật: **4/5 bài lấy được số**, 0 lỗi `invalidMetric`. Bài
"KK Coach" trả `👍1` — bằng chứng đường dữ liệu thật sự chạy chứ không phải 0 giả.
1 bài còn lại lỗi `(#10)` (token không truy cập được object đó) và **không** bị đánh
dấu xoá ⇒ lần sau vẫn thử lại. Migration `20260808064846_post_insights_real_metrics`,
`erd.md` đã cập nhật.

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:** N test · coverage service ?%
- **Còn nợ:**
