# Plan 22 — Nhiều ảnh trong 1 content_assets record (thay thế assetsPerPost)

**Milestone:** Phase 2
**Trạng thái:** 🟡 code + test xong 2026-08-06 — **chưa smoke UI/Page thật** (§5)
**Phụ thuộc:** Plan 04 (content-assets, DONE), Plan 09 (đăng tay, DONE) — hạ tầng đăng
album (`PublishMediaService.publishAlbum`, `FacebookPublisherClient.publishImageAlbum`)
**tái sử dụng nguyên vẹn** từ nhánh code của Plan 21 (nay đã bị thay thế, xem ghi chú
đầu file đó)
**Phải xong TRƯỚC:** Plan 23 (upload media qua hàng đợi) — endpoint upload ở plan đó
phải biết hình dạng "N ảnh/1 record" ngay từ đầu, không sửa lại sau khi đã code queue
**Spec tham chiếu:** không có spec riêng trong `docs/` — thay thế hướng cũ ở Plan 21
theo quyết định user 2026-08-06 (xem `plans/21-album-post.md`, đã ghi "BỊ THAY THẾ")

---

## 0. Bối cảnh quyết định

Ban đầu bàn tới việc "record nhiều ảnh có nên cộng dồn với `assetsPerPost` (Bot tự
ghép N record rời rạc, plan 21) hay không" — đã hỏi user và được chọn hướng "record
tự quyết, bỏ qua assetsPerPost". Ngay sau đó user quyết định **đơn giản hơn nữa: bỏ
hẳn `assetsPerPost`**, vì nếu muốn 1 bài nhiều ảnh thì upload thẳng nhiều ảnh vào 1
record ở màn Quản lý Ảnh/Video — không cần Bot tự đoán cách ghép record rời rạc nữa.
Plan này viết theo quyết định cuối: **xoá `assetsPerPost`, thay bằng
`content_asset_files`.**

## 1. Mục tiêu

Khi upload ảnh ở màn Quản lý Ảnh/Video, cho phép chọn **nhiều ảnh cùng lúc** để tạo
thành **1 `content_assets` record duy nhất** (thay vì N record rời rạc). Khi đăng bài
— tay hoặc Bot — **toàn bộ ảnh của record đó** lên thành 1 bài Facebook nhiều ảnh
(album), tự động, không cần cấu hình gì thêm ở mốc giờ auto-post. Thay thế hoàn toàn
cơ chế `assetsPerPost` của plan 21. Lợi ích thêm: **đăng tay cũng có album** (plan 21
chỉ hỗ trợ auto-post, chủ động loại đăng tay khỏi phạm vi).

## 2. Ngoài phạm vi

- **Album video** — Graph API không hỗ trợ ghép nhiều video vào 1 bài feed, giữ
  nguyên giới hạn cũ (chặn ở service bằng 400, khoá ở UI).
- **Sửa danh sách ảnh sau khi đã tạo record** — cố định lúc upload; muốn đổi ảnh thì
  xoá record, upload lại. Có thể làm sau nếu phát sinh nhu cầu thật — ghi nợ, không
  làm trước.
- **Đổi cơ chế upload thành hàng đợi/song song** — đó là Plan 23, làm **sau** plan
  này, không trộn 2 việc vào 1 lần code.
- Sửa `docs/` — nếu phát hiện lệch (hiện chưa thấy `assetsPerPost` được nhắc trong
  `docs/03`/`docs/04`, nên không có gì lệch để dọn), theo rule 00 vẫn không tự sửa.

## 3. Thiết kế

### 3.1 Schema

**Xoá** (rollback 1 phần plan 21 — migration MỚI, không sửa migration
`20260805170928_album_post` cũ, rule 00):

```prisma
model AutoPostSlot {
  assetsPerPost Int @default(1) @map("assets_per_post")   // XOÁ field này
}

model PublishJobAsset { ... }   // XOÁ nguyên bảng

model PublishJob {
  extraAssets PublishJobAsset[]   // XOÁ quan hệ này
}

model ContentAsset {
  albumSlots PublishJobAsset[]   // XOÁ quan hệ này (dòng hiện tại: "vị trí ảnh phụ
                                  // trong các bài album")
}
```

**Thêm:**

```prisma
model ContentAssetFile {
  id             String   @id @default(uuid()) @db.Uuid
  contentAssetId String   @map("content_asset_id") @db.Uuid
  position       Int      // >= 1 — ảnh đầu (position 0) chính là content_assets đó
  driveFileId    String   @map("drive_file_id")
  driveUrl       String?  @map("drive_url")
  thumbnailUrl   String?  @map("thumbnail_url")
  mimeType       String?  @map("mime_type")
  fileSize       BigInt?  @map("file_size")
  createdAt      DateTime @default(now()) @map("created_at")

  contentAsset ContentAsset @relation(fields: [contentAssetId], references: [id], onDelete: Cascade)

  @@unique([contentAssetId, position])
  @@index([contentAssetId])
  @@map("content_asset_files")
}

model ContentAsset {
  extraFiles ContentAssetFile[]   // MỚI
}
```

Cập nhật `erd.md` cùng migration (rule 05) — xoá bảng/field cũ, thêm bảng mới, ghi rõ
trong "Lịch sử thay đổi" rằng đây là migration **đảo ngược 1 phần** của
`20260805170928_album_post`, kèm lý do (quyết định user 2026-08-06).

### 3.2 Tái sử dụng hạ tầng đăng album — không viết lại

`PublishMediaService.publish(params: { contents: ContentAsset[] })` **không đổi gì**
— nó chỉ cần một mảng, không quan tâm mảng đó ghép từ đâu. Chỉ đổi **nguồn** mảng.

`PublishJobsRepository.findForExecution()` — nơi DUY NHẤT ghép danh sách ảnh của job
(comment sẵn có trong code: *"Chỗ khác tự nối tay là sớm muộn cũng quên ảnh phụ"* —
nguyên tắc này giữ nguyên, chỉ đổi bảng nguồn):

- **Cũ:** `assets = [job.contentAsset, ...job.extraAssets.map(a => a.contentAsset)]`
  (đọc `publish_job_assets` — ảnh phụ là CÁC RECORD KHÁC do Bot tự chọn)
- **Mới:** `assets = [job.contentAsset, ...job.contentAsset.extraFiles.sort(position).map(toContentAssetShape)]`
  (đọc `content_asset_files` CỦA CHÍNH content asset đang đăng)

`toContentAssetShape(file: ContentAssetFile, primary: ContentAsset): ContentAsset`:
`PublishMediaParams.contents` thực chất chỉ dùng `driveFileId` + `mediaType` (+
`title` cho message lỗi "album chỉ ghép được ảnh") từ mỗi phần tử — map bằng cách
spread `primary` rồi override `driveFileId` (1 bài chỉ có 1 caption/category/status,
không cần N bản copy metadata).

`PublishJobsRepository.create()`: bỏ hẳn tham số `extraContentAssetIds` + nested
write `extraAssets` — job luôn ứng đúng 1 `contentAssetId`, giống hệt thời điểm
**trước** plan 21.

### 3.3 Scheduler & Picker — quay lại đơn giản như trước plan 21

`auto-post-scheduler.service.ts`: bỏ hẳn khối `assetsPerPost`/`chunk()` (dòng
144-183 hiện tại) — `limit = slot.postCount` (bỏ nhân `assetsPerPost`), tạo đúng
**1 job cho MỖI content** picker chọn ra.

`content-picker.repository.ts`: bỏ điều kiện loại trừ theo `publish_job_assets`
(bảng không còn tồn tại). Điều kiện loại trừ theo chính `publish_jobs.content_asset_id`
**giữ nguyên** (có từ trước plan 21, không đụng).

**Picker không cần biết gì về `content_asset_files`** — mỗi content vẫn là đúng 1
dòng trong `content_assets`; nhiều ảnh của nó tự động đi kèm lúc **publish** (§3.2),
không phải lúc **pick**. Đây là điểm đơn giản hơn hẳn so với cơ chế cũ.

### 3.4 Dọn dẹp phần bị thay thế của Plan 21

- `auto-post-configs` module: bỏ field `assetsPerPost` khỏi DTO create/update slot,
  service (kể cả validate `assetsPerPost × mediaType`), mapper, response type.
- Di dời hằng số `MAX_ASSETS_PER_POST = 10` (trần ảnh/bài theo Facebook) từ
  `auto-post-configs.service.ts` sang module `content-assets`, đổi tên cho đúng ngữ
  cảnh mới: `MAX_IMAGES_PER_CONTENT_ASSET`.
- Xoá test cũ gắn với `assetsPerPost`/`publish_job_assets`: picker loại ảnh phụ,
  scheduler chia nhóm, validate assetsPerPost×mediaType, executor mark\* nhiều asset
  theo `extraAssets`. **Giữ lại** test 2 pha của `publishImageAlbum` (hạ tầng dùng
  chung, hành vi Graph API không đổi).
- FE `AutoPostSettingsPage.tsx`: bỏ field "Số ảnh/video trong 1 bài" + cột bảng liên
  quan + type FE tương ứng.

### 3.5 Upload nhiều ảnh (màn Quản lý Ảnh/Video)

- `ContentManagementPage.tsx` — Upload component: khi các file đã chọn **đều là
  ảnh** (jpg/png/webp), cho phép multi-select (bỏ `maxCount={1}`, thêm
  `multiple: true`), tối đa `MAX_IMAGES_PER_CONTENT_ASSET` (10) file. Chọn 1 video
  ⇒ khoá về đúng 1 file (giữ nguyên hành vi cũ — Graph API không ghép album video).
- Ảnh **đầu tiên** trong danh sách đã chọn = ảnh đại diện (driveFileId/driveUrl/
  thumbnailUrl của chính `content_assets`), các ảnh còn lại tạo `ContentAssetFile`
  position 1..N-1 theo đúng thứ tự đã chọn trên UI.
- Backend: nhận nhiều file trong 1 request multipart (field lặp `files`), đẩy Drive
  **tuần tự từng ảnh** (tái dùng logic hiện có của `MediaService.upload()`, gọi lại
  nhiều lần — không viết upload-nhiều-file kiểu khác), rồi
  `ContentAssetsService.create()` mở rộng để ghi kèm `extraFiles` trong **cùng 1
  transaction** với record chính (nhất quán: tạo thiếu ảnh phụ là dở dang).
  Quyết định lúc code: dùng thẳng `POST /media/upload` gọi N lần từ FE + 1 lần
  `POST /content-assets` gửi kèm mảng `extraFiles`, hay gộp thành 1 endpoint mới —
  cân nhắc dựa theo mức đụng vào Plan 23 (khuyến nghị: giữ 2 bước như hiện tại ở
  bản đồng bộ này, Plan 23 sẽ gộp lại thành 1 job khi chuyển sang hàng đợi).
- UI bảng danh sách + Drawer sửa bài: hiện badge "+N ảnh" khi record có
  `extraFiles.length > 0` (không cho sửa danh sách ảnh — xem §2).

### 3.6 API response

`ContentAssetResponse` (mapper) thêm field `imageCount: number` (1 = record thường,
>1 = có `extraFiles`) — đủ để FE hiện badge trên bảng danh sách, không cần trả
nguyên mảng file ở đây (tốn băng thông không cần thiết). `GET /content-assets/:id`
(đã có sẵn, dùng cho Drawer) trả đủ mảng `extraFiles` khi cần xem chi tiết.

## 4. Task

- [x] Kiểm tra DB trước khi migrate: `SELECT COUNT(*) FROM publish_job_assets` — nếu
      >0 phải xử lý tay trước (xem §6 rủi ro), không tự ý xoá dữ liệu job đang chờ
- [x] Migration: xoá `assets_per_post` + bảng `publish_job_assets`, thêm bảng
      `content_asset_files` — 1 migration mới
- [x] Cập nhật `erd.md` — xoá bảng/field cũ, thêm bảng mới, ghi lịch sử rõ ràng kèm
      lý do đảo ngược
- [x] `PublishJobsRepository`: đổi `findForExecution()` đọc `content_asset_files`
      của `job.contentAsset`; bỏ `extraContentAssetIds` khỏi `create()`
- [x] `auto-post-scheduler.service.ts`: bỏ `assetsPerPost`/`chunk()`, quay về 1
      job/1 content (`limit = postCount`)
- [x] `content-picker.repository.ts`: bỏ điều kiện loại trừ theo `publish_job_assets`
- [x] `auto-post-configs`: bỏ `assetsPerPost` khỏi DTO/service/mapper/response
- [x] Di dời + đổi tên `MAX_ASSETS_PER_POST` → `MAX_IMAGES_PER_CONTENT_ASSET` sang
      module `content-assets`
- [x] `ContentAssetsService.create()`: nhận + ghi `extraFiles` trong cùng
      transaction với record chính; validate ảnh phụ chỉ hợp lệ khi `mediaType=image`,
      tối đa `MAX_IMAGES_PER_CONTENT_ASSET`
- [x] Mapper: thêm `imageCount` vào `ContentAssetResponse`; `GET /content-assets/:id`
      trả kèm `extraFiles`
- [x] Xoá test cũ gắn `assetsPerPost`/`publish_job_assets` (picker/scheduler/DTO/executor)
- [x] Viết test mới: tạo record nhiều ảnh (cap 10, chặn khi mediaType=video),
      `findForExecution()` ghép đúng thứ tự `content_asset_files`, đăng tay 1 record
      nhiều ảnh ra đúng 1 bài album, đăng tay 1 record 1 ảnh vẫn ra bài thường (không
      đổi hành vi cũ — hồi quy quan trọng), Bot tự động cũng ra đúng kết quả tương tự,
      xoá record nhiều ảnh ⇒ `content_asset_files` cascade theo
- [x] FE: Upload component multi-select ảnh (khoá về 1 khi là video), badge "+N ảnh"
      trên bảng + Drawer, bỏ field "Số ảnh/video trong 1 bài" ở `AutoPostSettingsPage`
- [x] `npm run lint && npm run build` xanh 2 phía (+ `npm run test`)
- [x] Cập nhật `contexts.md`: đóng nợ #28 (plan 21) với ghi chú "bị thay thế bởi
      plan 22", rút gọn nợ #29 (ý tưởng đã thành plan thật, không còn là "chưa chốt")
- [x] Quyết định lúc đóng plan: `plans/21-album-post.md` **giữ nguyên ở `plans/`**
      (không chuyển vào `DONE/`, vì mục tiêu ban đầu không đạt theo hướng đó) — trạng
      thái "BỊ THAY THẾ" đã ghi sẵn trong chính file, đủ để không ai hiểu lầm

## 5. Điều kiện nghiệm thu

- [ ] Chọn 4 ảnh cùng lúc lúc upload ⇒ tạo đúng 1 `content_assets` record + 3
      `content_asset_files`, badge "+3 ảnh" hiện trên bảng
- [ ] Chọn 1 video ⇒ vẫn upload bình thường như cũ, không bị ép chọn nhiều file
- [ ] Chọn 11 ảnh ⇒ lỗi rõ ràng "tối đa 10 ảnh", không tạo record dở dang
- [ ] Bấm "Đăng bài thủ công" chọn record 4 ảnh ⇒ Facebook hiện **đúng 1 bài 4 ảnh**
      (trước đây plan 21 không hỗ trợ đăng tay — giờ tự động có, không cần code thêm
      ở module `manual-post`)
- [ ] Auto-post: mốc giờ tới hạn, kho có record 4 ảnh ⇒ Bot đăng đúng 1 bài 4 ảnh,
      record chuyển `PUBLISHED`, không cần cấu hình gì thêm ở slot
- [ ] Record 1 ảnh (dữ liệu cũ/thường, không có `content_asset_files`) vẫn đăng bài
      thường — không breaking cho dữ liệu hiện có
- [ ] Xoá 1 record nhiều ảnh ⇒ `content_asset_files` con bị xoá theo (cascade),
      không để rác trong DB

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Xoá bảng `publish_job_assets` mất dữ liệu job album cũ nếu có job thật đang `QUEUED` dùng bảng này | Kiểm tra DB trước khi migrate (task đầu tiên ở §4) — plan 21 chưa smoke UI thật nên khả năng cao = 0 dòng; nếu >0 phải xử lý tay trước (không tự ý xoá dữ liệu đang chờ đăng thật) |
| `toContentAssetShape()` spread nhầm field (vd giữ `id` của record chính cho ảnh phụ, lộ sai trong audit log) | Test rõ ràng field nào override (`driveFileId`) vs field nào giữ nguyên (`mediaType`, `title`) |
| Upload N ảnh 1 lượt — 1 ảnh giữa chừng lỗi (Drive quota/mạng rớt) | Rollback toàn bộ: xoá các ảnh đã lỡ lên Drive trong cùng lượt, không tạo record dở dang (nhất quán với hành vi hiện tại khi 1 file lỗi) |
| Đổi hướng giữa chừng khi Plan 23 đã bắt đầu code | Đây chính là lý do plan này phải làm **trước** Plan 23 — đã ghi rõ ở đầu file Plan 23 |
| `docs/03-database-design.md` §7 (picker) đang được Plan 21 tham chiếu — có thể có câu SQL mẫu nhắc `assetsPerPost` | Đã kiểm tra (grep) — hiện **không** có, không phát sinh nợ dọn docs |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-06 (code + test xong; **chưa smoke UI/Page thật**)
- **Migration:** `20260806090000_content_asset_files` — kiểm tra trước khi chạy:
  `publish_job_assets` **0 dòng**, mọi slot `assets_per_post = 1` ⇒ không mất dữ liệu.
- **File chính:** `backend/prisma/schema.prisma`, `erd.md`,
  `backend/src/modules/content-assets/{content-assets.constants,content-assets.repository,
  content-assets.service,content-asset.mapper,dto/create-content-asset.dto}.ts`,
  `backend/src/modules/publish-jobs/{publish-media.service,publish-jobs.repository,
  publish-jobs.service,publish-executor.service}.ts`,
  `backend/src/modules/auto-post/{auto-post-scheduler.service,content-picker.repository}.ts`,
  `backend/src/modules/auto-post-configs/*`, `backend/src/modules/manual-post/manual-post.service.ts`,
  `frontend/src/pages/{ContentManagementPage,AutoPostSettingsPage}.tsx`,
  `frontend/src/{types/index,utils/constants}.ts`
- **Khác thiết kế ban đầu:**
  1. §3.2 định để hàm ghép ảnh (`toContentAssetShape`) nằm trong `PublishJobsRepository`.
     Thực tế đăng **tay** cũng cần ghép ⇒ đưa thành `toPublishContents()` export từ
     `publish-media.service.ts`, cả hai đường publish dùng chung một hàm duy nhất.
  2. Phát sinh (không có trong plan): `PublishExecutorService` trước đây lấy
     `contentAssetIds = job.assets.map(a => a.id)` để ghi trạng thái. Sau plan này
     `assets` là danh sách **file** (id của `content_asset_files`) nên phải đổi sang
     `[job.contentAssetId]` — nếu quên, `markSuccess` sẽ upsert assignment bằng id
     không tồn tại và nổ FK ngay lần đăng album đầu tiên.
  3. Phát sinh: `ContentAssetsService.removeExisting()` chỉ xoá **1** file Drive.
     Đã sửa để xoá mọi ảnh của bài — `content_asset_files` cascade theo record nên
     sau khi xoá không còn ai nhớ fileId của ảnh phụ ⇒ file mồ côi vĩnh viễn.
  4. `extraFiles` được include sẵn trong `ACTOR_INCLUDE` (mọi query content) thay vì
     chỉ ở `GET /:id` — bảng con rất nhỏ, đổi lại `imageCount` luôn đúng ở mọi đường
     và đăng tay có ảnh phụ mà không phải query thêm.
- **Test:** BE **737 xanh (+10)** — create nhiều ảnh (thứ tự, cap 10, chặn video),
  `toPublishContents` (override field FILE / giữ field BÀI / giữ thứ tự), executor ghi
  trạng thái đúng 1 content dù bài N ảnh, xoá bài xoá mọi file Drive, `imageCount` trong
  response; đã **xoá** test cũ của plan 21 (picker loại ảnh phụ, scheduler chia nhóm,
  validate assetsPerPost×mediaType, executor mark\* nhiều asset). FE 41 test cũ xanh.
  lint + build xanh 2 phía.
- **Còn nợ:** toàn bộ §5 (nghiệm thu bấm tay trên UI + Page thật) — chưa làm ở session
  này. Riêng "đăng 1 bài 4 ảnh lên Facebook thật" vẫn kẹt chung với nợ Page token (§6
  mục 10 của `contexts.md`).
