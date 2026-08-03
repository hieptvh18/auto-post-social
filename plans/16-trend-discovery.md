# Plan 16 — Trend Discovery: dò video hot theo từ khoá (YouTube)

**Milestone:** M11 (Phase 2)
**Trạng thái:** ⬜ chưa làm — mới chốt thiết kế 2026-07-30
**Phụ thuộc:** `15-facebook-login-connect.md` **phải nghiệm thu xong** (xem §6 R0) ·
`DONE/07-autopost-engine.md` (mượn khuôn cron + claim chống double-fire) ·
`DONE/03c-drive-auth-modes.md` (mẫu lưu credential trong `app_settings`)
**Spec tham chiếu:** không có — feature này **ngoài `docs/`**, `docs/` không mô tả nguồn
đầu vào nào ngoài upload tay. Plan này là spec tạm; nếu feature sống sót qua nghiệm thu
thì mới bổ sung vào `docs/`.

---

## 1. Mục tiêu

Hôm nay đầu vào của kho nội dung chỉ có **một nguồn duy nhất: người dùng tự upload file
lên Drive**. Không có cách nào biết đang nên làm nội dung gì.

Sau feature này: user khai báo bộ **từ khoá theo dõi**, hệ thống tự quét YouTube theo
lịch, đo **tốc độ tăng view** của từng video qua nhiều mốc thời gian, chấm điểm và hiển
thị bảng xếp hạng ở màn `/trends` — trả lời được câu "chủ đề/format nào đang lên trong
7 ngày qua".

### Ranh giới quan trọng — đọc trước khi code

**Giai đoạn 1 (plan này) là màn hình NGHIÊN CỨU, không phải máy sản xuất nội dung.**
Nó **không tải video**, **không đẩy gì vào `content_assets`**, **không đụng
`publish_jobs`**. Đầu ra duy nhất là thông tin để con người quyết định.

Lý do ranh giới này nằm ngay ở §1 chứ không phải §2: nhu cầu ban đầu là "clone video
YouTube rồi auto-post". Việc đó **không làm được hợp lệ** — YouTube Data API cố tình
không trả stream tải video, mọi đường tải đều vi phạm YouTube ToS và đánh đổi bằng
nguy cơ khoá API project (mất luôn chính tính năng này), còn video reup vẫn là xâm phạm
bản quyền bất kể có bị Content ID phát hiện hay không. Page doanh nghiệp trong dự án
này là tài sản **được share quyền**, không phải tài sản của mình để đem chịu strike.

⇒ Đường import chỉ mở ở **giai đoạn 2** và **chỉ với nguồn có license** (§3.7).

## 2. Ngoài phạm vi

- **Không** tải/lưu/transcode video. Chỉ lưu metadata + thumbnail URL.
- **Không** import vào `content_assets` ở giai đoạn 1 (giai đoạn 2, sau license gate).
- **Không** làm TikTok. Chỉ định nghĩa `TrendSourceAdapter` để cắm thêm sau — viết
  interface, **không** viết `TiktokTrendAdapter` rỗng lấy lệ.
- **Không** đụng scheduler/picker/publisher hiện có. Module này là producer độc lập.
- **Không** làm AI gợi ý caption / tóm tắt nội dung video (ngoài scope MVP, PLAN-MVP §3).
- **Không** crawl HTML YouTube khi hết quota API. Hết quota thì `SKIPPED`, không có
  đường vòng.
- **Không** làm biểu đồ so sánh nhiều keyword, không export CSV. Bảng + sparkline là đủ.

## 3. Thiết kế

### 3.1 Luồng

```text
trend_keywords (user khai báo, ACTIVE)
   │
   ├── Cron A — DISCOVERY  @Cron('0 */6 * * *', tz Asia/Ho_Chi_Minh)
   │      claim qua trend_discovery_runs (UNIQUE keyword+date+slot)  ← ADR-006
   │      ▼ search.list (100 quota units/lần — ĐẮT)
   │      upsert trend_videos
   │
   └── Cron B — METRICS    @Cron('*/30 * * * *')
          ▼ videos.list batch 50 id (1 quota unit/lần — RẺ)
          insert trend_video_metrics (snapshot, append-only)
          ▼
       TrendScoringService (hàm thuần) → trend_videos.latest_score
                                              ▼
                                      UI /trends (bảng + sparkline)
```

Hai cron tách rời là **quyết định kiến trúc chính**, lý do ở §3.2.

### 3.2 Ràng buộc quota — thứ định hình cả module

YouTube Data API v3, quota mặc định **10.000 units/ngày** cho một project:

| Endpoint | Quota/lần | Dùng vào việc gì |
|---|---|---|
| `search.list` | **100** | Tìm video mới theo keyword |
| `videos.list` (≤50 id) | **1** | Refresh view/like/comment |
| `videos.list?chart=mostPopular&regionCode=VN` | **1** | Nguồn nền "đang thịnh hành VN" |

⇒ **Tối đa ~100 lần `search.list`/ngày**, dù mỗi lần trả về 50 kết quả. Không thể quét
dày. Ngược lại đo metrics gần như miễn phí.

Hệ quả bắt buộc:
1. `search.list` **chỉ** chạy ở Cron A, 4 lần/ngày, mỗi keyword ACTIVE 1 lần/chu kỳ.
2. Chặn cứng **tối đa 20 keyword ACTIVE** ở service (20 × 4 = 80 units-lần/ngày = 8.000
   units, còn dư ~2.000 cho metrics). Vượt ⇒ `UnprocessableEntityException`, kèm message
   nói rõ phải tắt bớt keyword.
3. Velocity **chỉ tính được** nhờ Cron B chạy dày ⇒ đây là lý do phải tách 2 cron, không
   gộp làm một.
4. Ghi `quota_used` vào `trend_discovery_runs`. Ngưỡng ngày vượt `YOUTUBE_DAILY_QUOTA`
   ⇒ run kế tiếp `SKIPPED` với `skip_reason = 'QUOTA_EXCEEDED'`, **không gọi API rồi mới
   ăn 403** — đúng kiểu `skip_reason` đã làm ở `slot_runs`.

### 3.3 Công thức chấm điểm

View tuyệt đối là chỉ số vô dụng — video 5 năm tuổi luôn thắng. Dùng **velocity**:

```ts
// src/modules/trends/trend-scoring.ts — hàm thuần, không I/O, test bắt buộc
velocity   = (views_new - views_old) / max(giờ_giữa_2_snapshot, 0.5)
freshness  = 1 / (1 + tuổi_video_giờ / 24)
engagement = (likes + comments) / max(views, 1)

score = 0.6 * log10(velocity + 1) + 0.3 * freshness + 0.1 * engagement
```

Quy tắc hành vi (đây là phần dễ code sai):
- **< 2 snapshot ⇒ `score = null`**, không phải 0. UI hiển thị "đang đo", không xếp hạng.
  Video mới phát hiện ở lần quét đầu luôn rơi vào trạng thái này — đúng, không phải bug.
- Δgiờ nhỏ hơn 30 phút ⇒ kẹp mẫu số về 0.5 để không nổ số.
- `views` giảm (YouTube có chỉnh lại số) ⇒ velocity kẹp về 0, không âm.
- Trọng số `0.6/0.3/0.1` để **constant có tên** ở đầu file, không rải magic number.

### 3.4 Schema — bắt buộc cập nhật `erd.md` cùng migration (rule 05)

```prisma
enum TrendPlatform      { YOUTUBE TIKTOK }
enum TrendVideoStatus   { NEW SHORTLISTED REJECTED }   // IMPORTED thêm ở giai đoạn 2
enum TrendRunStatus     { SUCCESS SKIPPED FAILED }

model TrendKeyword {
  id          String        @id @default(uuid()) @db.Uuid
  keyword     String
  platform    TrendPlatform @default(YOUTUBE)
  regionCode  String        @default("VN") @map("region_code")
  category    String?       // gợi ý map sang content_assets.category ở gđ 2
  isActive    Boolean       @default(true) @map("is_active")
  createdById String        @map("created_by") @db.Uuid
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")
  @@unique([keyword, platform, regionCode])
  @@map("trend_keywords")
}

model TrendVideo {
  id           String           @id @default(uuid()) @db.Uuid
  platform     TrendPlatform
  externalId   String           @map("external_id")     // youtube videoId
  keywordId    String?          @map("keyword_id") @db.Uuid  // keyword phát hiện đầu tiên
  title        String
  channelId    String           @map("channel_id")
  channelTitle String           @map("channel_title")
  publishedAt  DateTime         @map("published_at")
  durationSec  Int              @map("duration_sec")
  thumbnailUrl String           @map("thumbnail_url")
  licenseType  String           @map("license_type")    // 'youtube' | 'creativeCommon'
  latestScore  Decimal?         @map("latest_score") @db.Decimal(10, 4)
  scoredAt     DateTime?        @map("scored_at")
  status       TrendVideoStatus @default(NEW)
  createdAt    DateTime         @default(now()) @map("created_at")
  updatedAt    DateTime         @updatedAt @map("updated_at")
  @@unique([platform, externalId])
  @@index([latestScore(sort: Desc)])
  @@map("trend_videos")
}

model TrendVideoMetric {          // append-only snapshot, KHÔNG nhét vào trend_videos
  id           String   @id @default(uuid()) @db.Uuid
  trendVideoId String   @map("trend_video_id") @db.Uuid
  viewCount    BigInt   @map("view_count")
  likeCount    BigInt   @map("like_count")
  commentCount BigInt   @map("comment_count")
  capturedAt   DateTime @map("captured_at")
  @@index([trendVideoId, capturedAt])
  @@map("trend_video_metrics")
}

model TrendDiscoveryRun {         // nhật ký cron — khuôn từ slot_runs
  id         String         @id @default(uuid()) @db.Uuid
  keywordId  String?        @map("keyword_id") @db.Uuid
  runDate    DateTime       @map("run_date") @db.Date
  runSlot    String         @map("run_slot")   // 'HH:mm' giờ VN
  status     TrendRunStatus
  foundCount Int            @default(0) @map("found_count")
  newCount   Int            @default(0) @map("new_count")
  quotaUsed  Int            @default(0) @map("quota_used")
  skipReason String?        @map("skip_reason")
  errorMessage String?      @map("error_message")
  startedAt  DateTime       @map("started_at")
  finishedAt DateTime?      @map("finished_at")
  @@unique([keywordId, runDate, runSlot])   // chống double-fire — ADR-006
  @@map("trend_discovery_runs")
}
```

**`trend_video_metrics` phải là bảng riêng** — velocity cần Δ giữa 2 điểm thời gian,
nhét vào `trend_videos` là mất lịch sử và không tính được gì.

**Không đụng `content_assets` ở giai đoạn 1.** Cột `source`/`source_ref` để giai đoạn 2.

### 3.5 API key để ở đâu

Theo **ADR-014** (credential sửa được từ UI, không restart) — giống `facebook_app` ở
plan 15, **không** thêm biến `.env`:

```ts
SettingKey.YOUTUBE_API = 'youtube_api'
interface YoutubeApiSettingsValue {
  apiKeyEnc: string | null;    // AES-256-GCM, không bao giờ ra khỏi service
  dailyQuota: number;          // mặc định 10000
}
```

API trả về setting này phải **mask key** (4 ký tự cuối) như đang làm với page token.
Chưa cấu hình key ⇒ cron `SKIPPED/NOT_CONFIGURED`, không ném lỗi mỗi 30 phút vào log.

### 3.6 Module & endpoint

```text
src/infra/youtube/
├── trend-source.interface.ts     # TrendSourceAdapter — cửa cắm TikTok sau này
├── youtube-trend.adapter.ts      # search.list + videos.list, wrap lỗi thành domain error
└── youtube.types.ts

src/modules/trends/
├── trends.module.ts
├── trends.controller.ts
├── trends.service.ts
├── trend-keywords.repository.ts
├── trend-videos.repository.ts
├── trend-discovery.scheduler.ts  # Cron A + Cron B
├── trend-scoring.ts              # hàm thuần
└── __tests__/
```

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `GET` | `/trends/keywords` | `trends:view` | |
| `POST` | `/trends/keywords` | `trends:manage` | 409 nếu trùng, 422 nếu vượt 20 ACTIVE |
| `PATCH` | `/trends/keywords/:id` | `trends:manage` | bật/tắt, đổi category |
| `DELETE` | `/trends/keywords/:id` | `trends:manage` | soft delete, giữ video đã dò |
| `GET` | `/trends/videos` | `trends:view` | filter keyword/platform/status/minScore, sort score DESC |
| `GET` | `/trends/videos/:id/metrics` | `trends:view` | chuỗi snapshot cho sparkline |
| `PATCH` | `/trends/videos/:id` | `trends:manage` | chỉ đổi `status` (SHORTLISTED/REJECTED) |
| `GET` | `/trends/runs` | `trends:view` | nhật ký cron + quota đã tiêu hôm nay |
| `POST` | `/trends/discover-now` | `trends:manage` | chạy tay khỏi đợi mốc giờ, vẫn qua claim |

RBAC: `trends:view` cho ADMIN + EDITOR, `trends:manage` chỉ ADMIN (mỗi lần quét tiêu
quota chung). CONTENT không thấy menu. Cập nhật ma trận ở `docs/05-rbac.md` — **đây là
ngoại lệ được phép sửa `docs/`** vì thêm quyền mới, phải hỏi user trước khi sửa.

### 3.7 Giai đoạn 2 — ghi sẵn để không thiết kế lộn ngược (KHÔNG code trong plan này)

Khi mở đường import vào `content_assets`, `trend_videos` thêm:

```prisma
licenseKind         String     @map("license_kind")   // CREATIVE_COMMONS | PERMISSION_GRANTED | STOCK_LICENSED | UNKNOWN
licenseEvidenceUrl  String?    @map("license_evidence_url")
attributionText     String?    @map("attribution_text")
permissionGrantedAt DateTime?  @map("permission_granted_at")
contentAssetId      String?    @unique @map("content_asset_id")
```

Ba luật, **chặn ở service** đúng kiểu đã chặn `PUBLISHING`/`PUBLISHED` chỉ Bot được set:
1. `licenseKind = UNKNOWN` ⇒ **cấm import**, ném 422. Không có cờ nào bypass được.
2. `CREATIVE_COMMONS` ⇒ `attributionText` bắt buộc, và `PublishMediaService` **tự nối**
   vào caption khi đăng — CC-BY quên ghi công là mất license.
3. Nguồn dùng được: `search.list?videoLicense=creativeCommon` · creator đồng ý bằng
   văn bản (lưu `licenseEvidenceUrl`) · stock API có license thương mại (Pexels/Pixabay
   — các API này **có** endpoint tải thật, nối thẳng vào Drive uploader hiện có) · tự sản xuất.

## 4. Task

**Backend — nền**
- [ ] `SettingKey.YOUTUBE_API` + mask key khi trả API (mượn khuôn `facebook_app`)
- [ ] `infra/youtube/trend-source.interface.ts` + `youtube-trend.adapter.ts`
      (`search.list`, `videos.list`; lỗi 403 quota/400 key sai ⇒ domain error, không ném axios error)
- [ ] Migration `trend_discovery` (4 bảng + 3 enum) — **`erd.md` cập nhật trong cùng thay đổi**
- [ ] `trend-keywords.repository.ts`, `trend-videos.repository.ts`

**Backend — logic**
- [ ] `trend-scoring.ts` (hàm thuần, §3.3)
- [ ] `trend-discovery.scheduler.ts` — Cron A (6h) + Cron B (30 phút), claim qua `trend_discovery_runs`
- [ ] Quota guard: cộng dồn `quota_used` theo ngày, vượt ⇒ SKIPPED không gọi API
- [ ] `trends.service.ts` + controller + DTO + Swagger; chặn 20 keyword ACTIVE
- [ ] Permission `trends:view` / `trends:manage` vào ma trận RBAC (**hỏi user trước khi sửa `docs/05`**)

**Test bắt buộc** (vùng "logic phức tạp/dễ sai" — rule 02)
- [ ] Scoring: 1 snapshot ⇒ `null` · 2 snapshot ⇒ đúng công thức · cùng view nhưng video
      mới thắng video cũ · Δgiờ < 30 phút không nổ số · view giảm ⇒ velocity 0
- [ ] Double-fire: 2 tick cùng keyword/slot/ngày ⇒ 1 run
- [ ] Quota: vượt ngưỡng ⇒ SKIPPED, adapter **không** được gọi (assert qua mock)
- [ ] Adapter: mock HTTP — 403 quota ⇒ domain error · key sai ⇒ domain error · response
      thiếu field ⇒ không crash cron
- [ ] Chưa cấu hình key ⇒ SKIPPED/NOT_CONFIGURED
- [ ] RBAC: CONTENT gọi `/trends/videos` ⇒ 403 · EDITOR gọi `/trends/keywords` POST ⇒ 403

**Frontend**
- [ ] `src/api/trends.api.ts` + `src/hooks/useTrends.ts` + type ở `src/types/`
- [ ] `/trends`: tab **Từ khoá** (CRUD, bật/tắt, badge số keyword ACTIVE/20) + tab
      **Video hot** (bảng sort theo score, thumbnail, sparkline view, link YouTube,
      nút Shortlist/Bỏ qua) + panel **Trạng thái quét** (lần quét gần nhất, quota còn lại hôm nay)
- [ ] Banner khi chưa cấu hình API key → link sang `/settings`
- [ ] Video `score = null` hiển thị "đang đo", không xếp hạng lẫn vào bảng

**Chốt**
- [ ] `npm run lint && npm run build` xanh cả BE và FE
- [ ] `npm run test` xanh
- [ ] `.env.example`: **không đổi** (key nằm ở `app_settings` — xác nhận lại khi xong)
- [ ] Cập nhật `contexts.md` §4 §5, thêm ADR nếu chốt khác thiết kế

## 5. Điều kiện nghiệm thu

- [ ] Cấu hình API key thật ở `/settings`, thêm 3 keyword ⇒ bấm "Quét ngay" thấy video
      thật đổ về trong `/trends`, đúng `regionCode=VN`
- [ ] Đợi qua 2 chu kỳ Cron B (≥1h) ⇒ video có `score` khác `null`, sparkline có ≥2 điểm
- [ ] Video vừa dò lần đầu hiển thị "đang đo", **không** bị xếp hạng giả
- [ ] Bấm "Quét ngay" 2 lần liên tiếp trong cùng slot ⇒ chỉ 1 dòng trong `/trends/runs`
- [ ] Hạ `dailyQuota` xuống số nhỏ ⇒ run kế tiếp `SKIPPED/QUOTA_EXCEEDED`, log **không**
      có dòng lỗi 403 nào
- [ ] Xoá API key ⇒ cron `SKIPPED/NOT_CONFIGURED`, UI hiện banner, không spam log
- [ ] Đăng nhập bằng user CONTENT ⇒ **không thấy menu Trends**, gọi API trực tiếp ⇒ 403
- [ ] Kho `content_assets` và `publish_jobs` **không có bản ghi mới nào** sau toàn bộ
      bài test trên (chứng minh giai đoạn 1 thật sự chỉ đọc)
- [ ] `erd.md`: số bảng == số model trong `schema.prisma`, có bảng Enum/Index + dòng
      Lịch sử thay đổi

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R0 | **Mở M11 khi M10 chưa nghiệm thu** ⇒ 2 tầng chưa kiểm chứng chồng nhau; dự án chưa từng đăng thật lên Page nào (contexts §6 mục 10) | **Không bắt đầu plan này** trước khi plan 15 chạy được với Meta app thật và đăng thật 1 bài. Đây là điều kiện chặn, không phải khuyến nghị |
| R1 | Quota 10.000/ngày cạn ⇒ tính năng chết lặng giữa ngày | Chặn 20 keyword ACTIVE ở service · đếm `quota_used` · SKIPPED có lý do hiện lên UI, không im lặng |
| R2 | `search.list` trả về rác (video cũ, sai ngôn ngữ, clickbait) | Filter `publishedAfter` (30 ngày), `relevanceLanguage=vi`, `videoDuration`; và chính `score` đã phạt video cũ qua `freshness` |
| R3 | Trọng số scoring đoán sai ⇒ bảng xếp hạng vô nghĩa | Trọng số là constant có tên, chỉnh được không cần đổi schema. Nghiệm thu bằng mắt người vận hành trên dữ liệu thật trước khi tin |
| R4 | Cron B chạy 30 phút/lần với vài nghìn video ⇒ nặng dần | Chỉ refresh video `NEW`/`SHORTLISTED` và `published_at` trong 30 ngày; batch 50 id/lần; job cũ hơn ⇒ ngừng theo dõi |
| R5 | **Scope creep sang tải video / auto-post thẳng** | §1 + §2 là ranh giới cứng. Muốn import ⇒ mở plan 17 với license gate §3.7, không nhét vào plan này |
| R6 | Sửa `docs/05-rbac.md` để thêm quyền — vi phạm rule 00 §1 | Dừng, hỏi user, chỉ sửa khi user đồng ý; nếu không thì ghi nợ vào contexts §6 |
| R7 | YouTube đổi/siết API v3 | Adapter nằm sau interface ⇒ đổi 1 file. Đây cũng là lý do **không** crawl HTML làm đường vòng |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:** N test · coverage `trends/` ?%
- **Còn nợ:**
