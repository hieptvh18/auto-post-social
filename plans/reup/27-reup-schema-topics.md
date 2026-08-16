# Plan 27 — Schema Reup + CRUD chủ đề + màn `/reup` (web config)

**Milestone:** M12 · **Trạng thái:** ✅ xong 2026-08-15 (chưa smoke UI)
**Phụ thuộc:** [26-super-admin-role.md](./26-super-admin-role.md) **phải nghiệm thu xong**
**Spec tham chiếu:** không có trong `docs/` — plan này là spec tạm
**Bản đồ:** [README.md](./README.md)

---

## 1. Mục tiêu

Dựng toàn bộ **nền dữ liệu + màn cấu hình** cho reup, chưa tải video nào.

Sau plan này:
1. SUPER_ADMIN vào menu **Reup Setting**, khai báo được chủ đề ("Mẹo nấu ăn", nguồn
   YouTube, keyword, mỗi ngày 3 video, lọc ≥50k view, đăng trong 30 ngày, dài 15-180
   giây), bật/tắt chủ đề. Dữ liệu lưu đúng, chưa có cron nào chạy.
2. Màn **Quản lý Ảnh/Video** có dropdown lọc theo **Loại** (Reup / Tự upload / Tất cả)
   — **chỉ SUPER_ADMIN thấy**. Các role còn lại dùng màn này y như hôm nay và **không
   truy cập được** bài loại REUP qua bất kỳ đường nào, kể cả gọi thẳng API (§3.2).

Làm màn hình **trước** engine là cố ý: nó cho bạn nhìn thấy và sửa mô hình dữ liệu
bằng mắt trước khi có process nền ghi vào đó — sai mô hình ở bước này rẻ hơn sửa ở
plan 29 rất nhiều.

## 2. Ngoài phạm vi

- **Không** gọi YouTube API, **không** tải video, **không** cron. Đó là plan 28/29.
- **Không** đụng `MediaUploadJob`, `publish_jobs`, auto-post engine.
- **Không** làm tab "Video đã kéo" có dữ liệu thật — bảng `reup_videos` tạo ở plan này
  nhưng UI của nó làm ở plan 29 khi đã có dữ liệu để hiện.
- **Không** implement Douyin/TikTok (QĐ-2). Select có 3 option, chọn 2 cái kia thì lưu
  được nhưng plan 29 sẽ `SKIPPED`.

## 3. Thiết kế

### 3.1 Schema — 3 bảng mới + 2 cột trên `content_assets`

```prisma
enum ReupPlatform    { YOUTUBE DOUYIN TIKTOK }
enum ReupVideoStatus { PENDING DOWNLOADING DOWNLOADED UPLOADING IMPORTED FAILED SKIPPED }
enum ReupRunStatus   { CLAIMED DONE SKIPPED ERROR }   // khuôn từ SlotRunStatus
enum ContentSource   { MANUAL REUP }

/// Một "chủ đề cần reup" do người vận hành khai báo ở màn /reup.
model ReupTopic {
  id           String       @id @default(uuid()) @db.Uuid
  name         String                                   // "Mẹo nấu ăn"
  platform     ReupPlatform @default(YOUTUBE)
  keywords     String[]                                 // từ khoá tìm; YOUTUBE dùng search.list
  regionCode   String       @default("VN") @map("region_code")
  /// Map sang content_assets.category khi import — để bài reup vào đúng "Dạng" bài.
  category     String
  /// Số video tối đa kéo về MỖI NGÀY. Mặc định 3, chặn 1..10 ở DTO.
  dailyQuota   Int          @default(3) @map("daily_quota")
  minViewCount Int          @default(50000) @map("min_view_count")
  maxAgeDays   Int          @default(30) @map("max_age_days")
  minDurationSec Int        @default(15) @map("min_duration_sec")
  maxDurationSec Int        @default(180) @map("max_duration_sec")
  /// true = vào thẳng APPROVED (auto hoàn toàn). false = PENDING_REVIEW (QĐ-5).
  autoApprove  Boolean      @default(false) @map("auto_approve")
  /// Caption mặc định gắn cho bài reup; hỗ trợ {title} thay bằng tiêu đề video gốc.
  captionTemplate String?   @map("caption_template") @db.Text
  hashtags     String?      @db.Text
  isActive     Boolean      @default(true) @map("is_active")
  createdById  String       @map("created_by") @db.Uuid
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  createdBy User        @relation("ReupTopicCreator", fields: [createdById], references: [id])
  videos    ReupVideo[]
  runs      ReupRun[]

  @@unique([name, platform])
  @@index([isActive])
  @@map("reup_topics")
}

/// Một video nguồn đã phát hiện. UNIQUE(platform, external_id) là chỗ CHỐNG TẢI TRÙNG.
model ReupVideo {
  id             String          @id @default(uuid()) @db.Uuid
  topicId        String          @map("topic_id") @db.Uuid
  platform       ReupPlatform
  externalId     String          @map("external_id")      // youtube videoId
  sourceUrl      String          @map("source_url") @db.Text
  title          String
  authorName     String          @map("author_name")
  publishedAt    DateTime?       @map("published_at")
  durationSec    Int?            @map("duration_sec")
  viewCount      BigInt?         @map("view_count")       // lúc phát hiện, không refresh
  thumbnailUrl   String?         @map("thumbnail_url") @db.Text
  status         ReupVideoStatus @default(PENDING)
  /// Đường dẫn file tạm trên đĩa server — xoá sau khi lên Drive xong (plan 29).
  localPath      String?         @map("local_path") @db.Text
  fileSize       BigInt?         @map("file_size")
  /// Nối sang kho nội dung sau khi import xong (plan 29).
  contentAssetId String?         @unique @map("content_asset_id") @db.Uuid
  mediaUploadJobId String?       @map("media_upload_job_id") @db.Uuid
  errorMessage   String?         @map("error_message") @db.Text
  attemptCount   Int             @default(0) @map("attempt_count")
  discoveredAt   DateTime        @default(now()) @map("discovered_at")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  topic        ReupTopic     @relation(fields: [topicId], references: [id], onDelete: Cascade)
  contentAsset ContentAsset? @relation(fields: [contentAssetId], references: [id])

  @@unique([platform, externalId])          // ← chống tải trùng, QĐ-4
  @@index([status])
  @@index([topicId, discoveredAt])
  @@map("reup_videos")
}

/// Nhật ký một lần cron chạm một chủ đề — khuôn từ `slot_runs` (plan 07).
model ReupRun {
  id             String        @id @default(uuid()) @db.Uuid
  topicId        String        @map("topic_id") @db.Uuid
  runDate        String        @map("run_date")    // 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh
  status         ReupRunStatus @default(CLAIMED)
  foundCount     Int           @default(0) @map("found_count")
  pickedCount    Int           @default(0) @map("picked_count")
  skipReason     String?       @map("skip_reason") // QUOTA_EXCEEDED | NOT_CONFIGURED | PLATFORM_NOT_SUPPORTED | NO_NEW_VIDEO
  errorMessage   String?       @map("error_message") @db.Text
  startedAt      DateTime      @default(now()) @map("started_at")
  finishedAt     DateTime?     @map("finished_at")

  topic ReupTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@unique([topicId, runDate])              // ← chống double-fire, khuôn ADR-006
  @@index([runDate, status])
  @@map("reup_runs")
}
```

Trên `ContentAsset` thêm **2 cột** (QĐ-4):

```prisma
sourceType        ContentSource @default(MANUAL) @map("source_type")
resourceDeletedAt DateTime?     @map("resource_deleted_at")   // plan 30 dùng
reupVideo         ReupVideo?
```

`@default(MANUAL)` ⇒ toàn bộ bài cũ giữ nguyên hành vi, không cần backfill.

> **Rule 05:** `erd.md` cập nhật trong **cùng** thay đổi — 3 bảng mới, 4 enum mới,
> 2 cột mới, các index kèm lý do, dòng Lịch sử thay đổi.

### 3.2 Màn Quản lý Ảnh/Video — filter theo loại (chỗ dễ sai nhất của plan này)

Yêu cầu chốt với user 2026-08-15:

| Role | Thấy gì ở màn Quản lý Ảnh/Video |
|---|---|
| **SUPER_ADMIN** | Có dropdown **Loại**: `Reup` (**mặc định**) · `Tự upload` · `Tất cả`. Form thêm/sửa có select Loại, **chọn tự do** |
| ADMIN / EDITOR / CONTENT | **Không** có dropdown. Không thấy bài REUP nào, ở **bất kỳ** đâu. Form không có select Loại |

#### Luật chặn — ở SERVICE, không phải ở UI

Đây là ranh giới bảo mật, không phải tiện ích hiển thị. Ẩn dropdown ở FE là **chưa đủ** —
role khác gọi thẳng API với `?sourceType=REUP` vẫn phải **không** lấy được gì.

```text
ContentAssetsService.findAll(query, currentUser):

  nếu user KHÔNG có 'reup:view':
      BỎ QUA query.sourceType do client gửi (kể cả gửi REUP)
      ⇒ ÉP CỨNG sourceType = MANUAL
      (không ném 403 — chỉ lặng lẽ lọc, để role cũ dùng y như trước)

  nếu user CÓ 'reup:view':
      query.sourceType không truyền ⇒ mặc định REUP
      truyền MANUAL | REUP        ⇒ lọc đúng loại đó
      truyền ALL                  ⇒ không lọc
```

Áp cùng luật cho **findOne / update / delete**: role không có `reup:view` mà đụng vào
một `contentAsset` có `sourceType = REUP` ⇒ **404** (không phải 403 — 403 tiết lộ rằng
bài đó tồn tại).

#### Create / Update

- SUPER_ADMIN: DTO nhận `sourceType` (`MANUAL | REUP`), tạo/sửa tự do.
- Role khác: field `sourceType` trong DTO bị **bỏ qua**, luôn ghi `MANUAL`. Không cho
  client tự nâng loại bài — đây là RBAC field-level, đúng khuôn đã chặn `status`/`isAds`
  với role CONTENT.

#### Hai chỗ TUYỆT ĐỐI không được lọc

- **Picker của auto-post** — Bot phải nhặt được **cả** bài REUP; đó là mục đích cả feature.
- **Timeline / Lịch đăng bài / Dashboard / Publish jobs** — bài reup đã đăng vẫn phải
  hiện trong thống kê và lịch. Đây là màn *vận hành*, không phải kho nội dung.

⇒ Vì vậy việc lọc đặt ở **`ContentAssetsService`** (service của màn kho), **không** đặt ở
repository dùng chung, và **không** đặt ở tầng Prisma middleware. Đặt nhầm chỗ ⇒ Bot
không bao giờ đăng bài reup, hoặc Dashboard đếm thiếu — cả hai đều hỏng âm thầm, rất
khó lần ra.

> Ghi chú cho người code: mặc định của SUPER_ADMIN là `REUP` ⇒ sau plan này, đăng nhập
> SUPER_ADMIN vào màn Quản lý sẽ thấy **bảng rỗng** (chưa có bài reup nào cho tới plan
> 29). Đó là **đúng**, không phải bug. Đổi dropdown sang "Tự upload" để thấy kho cũ.

### 3.3 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `GET` | `/reup/topics` | `reup:view` | phân trang, filter `isActive`, `platform` |
| `POST` | `/reup/topics` | `reup:manage` | 409 nếu trùng `(name, platform)` |
| `GET` | `/reup/topics/:id` | `reup:view` | |
| `PATCH` | `/reup/topics/:id` | `reup:manage` | bật/tắt, đổi bộ lọc |
| `DELETE` | `/reup/topics/:id` | `reup:manage` | **soft delete** `isActive=false`, giữ `reup_videos` |

Ràng buộc kiểm ở **service** (không ở DTO, vì cần đọc state):
- `dailyQuota` 1..10 · `maxAgeDays` 1..365 · `minDurationSec < maxDurationSec` ⇒ 400
- `platform != YOUTUBE` ⇒ vẫn **cho lưu**, nhưng trả cảnh báo trong response và UI hiện
  badge "chưa hỗ trợ" (QĐ-2). Không ném lỗi — người dùng cần khai báo sẵn.
- `keywords` rỗng khi `platform = YOUTUBE` ⇒ 400 (không có keyword thì cron tìm bằng gì).

### 3.4 Module

```text
src/modules/reup/
├── reup.module.ts
├── reup-topics.controller.ts
├── reup-topics.service.ts
├── reup-topics.repository.ts
├── reup-topic.mapper.ts
├── dto/{create,update,query}-reup-topic.dto.ts
└── __tests__/reup-topics.service.spec.ts
```

### 3.5 Frontend — màn `/reup`

`ReupSettingsPage.tsx`, route `/reup`, chỉ SUPER_ADMIN (đã cấu hình ở plan 26).

Tab **Chủ đề** (plan này làm đủ):
- Bảng: tên · platform (badge) · keywords (tag) · category · quota/ngày · auto-approve
  (switch) · trạng thái · thao tác
- Modal thêm/sửa: đủ field §3.1. Select platform 3 option, YOUTUBE mặc định; chọn
  DOUYIN/TIKTOK hiện cảnh báo "chưa hỗ trợ — sẽ bỏ qua khi quét"
- Switch `autoApprove` phải có tooltip nói rõ hệ quả: *"Bật = video tải về vào thẳng
  hàng chờ đăng, không qua duyệt tay"*

Tab **Video đã kéo** và tab **Nhật ký quét**: render placeholder "Chưa có dữ liệu —
tính năng quét bật ở bước sau". Làm thật ở plan 29.

Menu: thêm mục **Reup Setting** vào `AdminLayout.tsx`, lọc bằng `canAccessRoute`.

## 4. Task

**Backend**
- [x] `schema.prisma`: 4 enum + 3 model + 2 cột trên `ContentAsset`
- [x] Migration `reup_topics_videos_runs` + **`erd.md` trong cùng thay đổi** (rule 05)
- [x] `reup-topics.repository.ts`
- [x] `reup-topics.service.ts` + validate nghiệp vụ §3.3
- [x] `reup-topics.controller.ts` + DTO + Swagger + `@RequirePermission`
- [x] `content-assets.service.ts` — `findAll`: không có `reup:view` ⇒ **ép cứng** MANUAL,
      bỏ qua `sourceType` client gửi; có `reup:view` ⇒ mặc định REUP, nhận `ALL` (§3.2)
- [x] `content-assets.service.ts` — `findOne/update/delete`: role thường đụng bài REUP ⇒ **404**
- [x] `content-assets` DTO create/update: `sourceType` chỉ SUPER_ADMIN ghi được, role khác
      bị bỏ qua và luôn ghi `MANUAL` (RBAC field-level)
- [x] `query-content-asset.dto.ts`: thêm `sourceType?: MANUAL | REUP | ALL`
- [x] Kiểm chứng picker auto-post **không** bị lọc (đọc code, ghi kết luận vào §7)
- [x] Kiểm chứng Timeline / Dashboard / publish-jobs **không** bị lọc

**Frontend**
- [x] `src/types/reup.ts` · `src/api/reup.api.ts` · `src/hooks/useReupTopics.ts`
- [x] `ReupSettingsPage.tsx` — tab Chủ đề đầy đủ, 2 tab kia placeholder
- [x] Menu **Reup Setting** trong `AdminLayout.tsx` + route
- [x] `ContentManagementPage.tsx`: dropdown **Loại** (Reup mặc định / Tự upload / Tất cả),
      **chỉ render khi `can(role, 'reup:view')`**
- [x] `ContentManagementPage.tsx`: **Tag** Loại khi đang xem "Tất cả" (đặt trong cột
      Trạng thái, không tạo cột thứ 11 — xem `ISSUES-TO-REVIEW.md` I9)
- [ ] ⚠️ **CHƯA LÀM** — Form thêm/sửa bài: select Loại. Backend đã hỗ trợ đủ + có test,
      nhưng luồng "Thêm bài" đi qua hàng đợi upload nên thêm select đòi sửa module
      `media-upload-jobs` mà §2 cấm đụng. Lý do đầy đủ: `ISSUES-TO-REVIEW.md` I8
- [x] Mutation nào cũng `invalidateQueries` (rule 01)

**Test bắt buộc**
- [x] `dailyQuota` ngoài 1..10 ⇒ 400 · `minDuration >= maxDuration` ⇒ 400
- [x] Trùng `(name, platform)` ⇒ 409
- [x] `platform = YOUTUBE` mà `keywords` rỗng ⇒ 400
- [x] DELETE ⇒ `isActive=false`, bản ghi **vẫn còn** trong DB
- [x] RBAC: ADMIN gọi `GET /reup/topics` ⇒ 403 · SUPER_ADMIN ⇒ 200

**Test bắt buộc — lọc `sourceType` (RBAC field-level, vùng bắt buộc rule 02)**
- [x] ADMIN `findAll` **không truyền** sourceType ⇒ chỉ trả bài MANUAL
- [x] ADMIN `findAll` **cố tình truyền** `sourceType=REUP` ⇒ vẫn chỉ trả MANUAL (bỏ qua,
      không ném lỗi) — đây là case chống lách qua API
- [x] ADMIN `findAll` truyền `sourceType=ALL` ⇒ vẫn chỉ MANUAL
- [x] SUPER_ADMIN **không truyền** ⇒ mặc định trả bài REUP
- [x] SUPER_ADMIN truyền `MANUAL` / `ALL` ⇒ trả đúng tương ứng
- [x] ADMIN gọi `findOne` một bài REUP ⇒ **404** (không phải 403)
- [x] ADMIN gọi `update`/`delete` bài REUP ⇒ **404**
- [x] ADMIN `create` gửi `sourceType=REUP` ⇒ bài tạo ra có `sourceType=MANUAL`
- [x] SUPER_ADMIN `create` gửi `sourceType=REUP` ⇒ ghi đúng REUP
- [x] Picker auto-post nhặt được bài `sourceType=REUP` (**không** bị lọc)

**Chốt**
- [x] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh
- [x] `.env.example`: không đổi
- [x] `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

> **Toàn bộ mục dưới đây mới phủ bằng UNIT TEST, chưa bấm tay trên UI/Swagger thật.**
> Ràng buộc RBAC (đường dễ hở nhất) đã có test đúng hành vi cho từng ca.

- [x] SUPER_ADMIN tạo chủ đề "Mẹo nấu ăn" ⇒ lưu đúng mọi default *(unit test)*
- [x] ADMIN gọi `/reup/topics` ⇒ 403 *(gác bằng `@RequirePermission('reup:view')`;
      test ma trận quyền khẳng định ADMIN **không** có `reup:view`)*
- [x] Chọn platform DOUYIN ⇒ lưu được + cờ `isPlatformSupported = false` *(unit test)*;
      UI đã render badge "chưa hỗ trợ" — **chưa bấm tay**
- [x] Tạo trùng tên + platform ⇒ 409, message tiếng Việt *(unit test)*
- [x] Role thường vào màn kho ⇒ **y hệt trước plan này**: `sourceType` bị ép cứng
      `MANUAL` cho ADMIN/EDITOR/CONTENT, gửi REUP/ALL cũng vậy *(4 unit test)*
- [ ] ⚠️ **CHƯA bấm tay** — SUPER_ADMIN đổi dropdown Reup/Tự upload/Tất cả trên UI thật
      *(logic đã có test; empty state "Chưa có bài reup" đã làm theo R1d)*
- [x] ADMIN đụng bài REUP qua `findOne`/`update`/`delete` ⇒ **404 chứ không 403**
      *(3 unit test riêng + 1 test khẳng định SUPER_ADMIN vẫn đọc được)*
- [x] ADMIN gọi `?sourceType=REUP` ⇒ **không lách được**, vẫn chỉ MANUAL, và **không**
      ném lỗi *(unit test — đây là ca chống lách qua API)*
- [x] Picker auto-post **không** bị lọc ⇒ Bot vẫn nhặt được bài REUP. **Kiểm chứng bằng
      đọc code:** `content-picker.repository.ts` dùng raw SQL, `grep` toàn bộ
      `auto-post/`, `dashboard/`, `publish-jobs/`, `publish-schedule/`, `manual-post/`
      ⇒ **không file nào** nhắc tới `source_type`/`sourceType` (cạm bẫy C8)
- [x] `erd.md`: 18 bảng == 18 model, có Enum/Index/Ràng buộc + Lịch sử

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Lọc `sourceType` đặt ở repository dùng chung / Prisma middleware ⇒ Bot không nhặt bài reup, Dashboard đếm thiếu — hỏng **âm thầm** (§3.2) | Đặt lọc **chỉ** ở `ContentAssetsService`; test khẳng định picker vẫn thấy bài REUP |
| R1b | Chỉ ẩn dropdown ở FE, quên chặn ở service ⇒ role thường gọi `?sourceType=REUP` vẫn đọc được bài reup | Ép cứng MANUAL ở service khi thiếu `reup:view`; test có case "cố tình truyền REUP" |
| R1c | `findOne/update/delete` quên áp luật ⇒ ADMIN đoán id là đọc/sửa được bài reup | 404 cho mọi truy cập lẻ vào bài REUP khi thiếu quyền; test riêng cho 3 method |
| R1d | SUPER_ADMIN mặc định thấy REUP ⇒ tưởng mất hết dữ liệu cũ (bảng rỗng ở plan này) | Ghi rõ trong §3.2 + nghiệm thu có bước đổi dropdown; UI hiện empty state nói rõ "Chưa có bài reup — bật quét ở Reup Setting" |
| R2 | Thêm cột vào `content_assets` — bảng lõi, hỏng là hỏng cả tool | `@default(MANUAL)` + nullable ⇒ không cần backfill, bài cũ không đổi hành vi |
| R3 | Mô hình `ReupTopic` thiếu field, phát hiện ở plan 29 ⇒ phải migrate lại | Đây chính là lý do làm UI trước engine — soi bằng mắt trên form thật trước khi có cron |
| R4 | `keywords String[]` — Postgres array, Prisma filter hạn chế | Chỉ dùng để đọc/ghi nguyên mảng, không filter theo phần tử. Cần filter ⇒ đổi bảng con sau |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-15
- **File chính:**
  - Schema: `prisma/schema.prisma` + migration `20260815010000_reup_topics_videos_runs`
  - Module mới: `src/modules/reup/` (`reup.module`, `reup-topics.{controller,service,repository}`,
    `reup-topic.mapper`, `dto/{create,update,query}-reup-topic.dto`, `__tests__/`)
  - RBAC màn kho: `content-assets.{service,repository}.ts`, `content-asset.mapper.ts`,
    `dto/{create,query}-content-asset.dto.ts`
  - Audit: `audit.service.ts` (12 action `REUP_*` + hằng `REUP_ACTION_PREFIX`)
  - FE: `types/reup.ts`, `api/reup.api.ts`, `hooks/useReupTopics.ts`,
    `pages/ReupSettingsPage.tsx`, `layouts/AdminLayout.tsx`, `App.tsx`,
    `pages/ContentManagementPage.tsx`, `pages/AuditLogsPage.tsx`
  - Docs: `erd.md` (sơ đồ + 4 enum + 10 index + 8 ràng buộc + Lịch sử)
- **Khác thiết kế ban đầu:**
  1. Migration **gộp sẵn 3 thay đổi của plan 29** (`quota_used`, `reup_video_id`,
     `MediaUploadSource.REUP`) ⇒ plan 29 không cần migration nào (I6).
  2. Luật 404 đặt ở `getOrFail()` thay vì sửa 3 method rời — phủ luôn 2 đường `bulk*`
     mà plan không nhắc tới nhưng cũng đọc bài theo id (I7).
  3. **Chưa** làm select "Loại" ở form thêm bài (I8) — backend đã đủ, chỉ thiếu nút bấm.
  4. Tag "Loại" nằm trong cột Trạng thái thay vì cột thứ 11 (I9).
  5. Thêm cờ `isPlatformSupported` vào response (không có trong plan): để UI không phải
     tự nhớ nền tảng nào đã hỗ trợ — thêm Douyin sau này chỉ sửa 1 hàm ở BE.
  6. Thêm trần **20 chủ đề đang bật** ngay ở plan này (plan xếp vào 29) — nó thuộc về
     `ReupTopicsService`, để lại thì plan 29 phải quay lại sửa service của plan 27.
  7. Thêm sẵn nhãn tiếng Việt cho 12 action reup ở `AuditLogsPage` (việc của plan 31) —
     rẻ hơn nhiều so với quay lại mở file lần nữa.
- **Kiểm chứng cạm bẫy C8 (bắt buộc ghi lại theo §4):** `grep -rn "source_type\|sourceType"`
  trên `auto-post/`, `dashboard/`, `publish-jobs/`, `publish-schedule/`, `manual-post/`
  ⇒ **không có kết quả nào**. `content-picker.repository.ts` dùng raw SQL, điều kiện WHERE
  chỉ gồm `status` / `is_active` / `category` / `media_type` ⇒ **Bot vẫn nhặt được bài REUP**.
  Field `sourceType` chỉ tồn tại ở `ContentAssetsRepository.findMany()` (màn kho).
- **Test:** BE **972 xanh (+40)** — 21 test `ReupTopicsService`, 19 test RBAC `sourceType`.
  FE **83 xanh** (không đổi — chưa test component theo rule 02). Lint + build xanh 2 phía.
- **Còn nợ:**
  1. **Chưa smoke UI thật** (phụ thuộc mục I5 — chưa có tài khoản SUPER_ADMIN để đăng nhập).
  2. Select "Loại" ở form thêm bài (I8).
  3. Tab "Video đã kéo" / "Nhật ký quét" mới là placeholder — đúng phạm vi, làm ở plan 29.
