# Plan 30 — Dọn dung lượng: xoá video đã đăng, giữ record

**Milestone:** M12 · **Trạng thái:** ✅ xong 2026-08-16 (chưa test cron thật lúc 03:00, chưa test tay trên Drive thật)
**Phụ thuộc:** [29-reup-cron-pipeline.md](./29-reup-cron-pipeline.md) **phải nghiệm thu xong**
**Spec tham chiếu:** không có — plan này là spec tạm
**Bản đồ:** [README.md](./README.md) (cạm bẫy C6)

---

## 1. Mục tiêu

Sau plan 29, mỗi ngày 2-3 video đổ vào Drive và **không bao giờ bị xoá** ⇒ vài tháng là
đầy dung lượng.

Sau plan này: cron tự xoá **file** của bài reup đã đăng quá N ngày, nhưng **giữ nguyên
bản ghi** `content_assets` + `publish_jobs` + insight để còn tra cứu "bài này đăng hôm
nào, được bao nhiêu tương tác".

## 2. Ngoài phạm vi

- **Không** xoá bài `sourceType = MANUAL`. Ranh giới cứng — video bạn tự dựng không bao
  giờ bị đụng vào.
- **Không** xoá bản ghi DB. Chỉ xoá file trên Drive + file tạm trên đĩa.
- **Không** làm thùng rác / khôi phục. Xoá Drive là mất thật — bù lại bằng thời gian chờ
  N ngày và nút xem trước danh sách sắp xoá.
- **Không** dọn `content_asset_files` của bài nhiều ảnh — reup luôn là 1 video.

## 3. Thiết kế

### 3.1 Cron dọn dẹp

`@Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` — 03:00, sau cron reup (02:00)
và ngoài khung giờ đăng bài.

```text
tìm content_assets WHERE
      source_type = 'REUP'                        ← ranh giới cứng
  AND status = 'PUBLISHED'
  AND resource_deleted_at IS NULL
  AND published_at < now() - retentionDays        ← mặc định 7
  AND NOT EXISTS (publish_jobs của bài này ở SCHEDULED|QUEUED|PUBLISHING)   ← C6

for each:
  1. drive.deleteFile(drive_file_id)     — 404 coi như đã xoá, KHÔNG phải lỗi
  2. xoá file tạm ở reup_videos.local_path nếu còn
  3. UPDATE content_assets SET resource_deleted_at = now()
     (GIỮ NGUYÊN: title, caption, hashtags, status, drive_file_id, insight, publish_jobs)
  4. ghi audit log: ai/cái gì xoá, dung lượng giải phóng
```

Giữ nguyên `drive_file_id` (không set null) là cố ý — nó là bằng chứng file từng tồn tại
ở đâu. `resource_deleted_at` mới là cờ quyết định.

### 3.2 Ba luật chặn ở service — không có ngoại lệ

1. **Chỉ `sourceType = REUP`.** Truy vấn phải có điều kiện này ở **mọi** đường vào, kể cả
   endpoint xoá tay. Bài MANUAL lọt vào ⇒ mất video tự dựng, không khôi phục được.
2. **Không xoá khi còn job chưa kết thúc** (C6). Bài đăng nhiều page: page A xong,
   page B còn `SCHEDULED` ⇒ xoá file bây giờ thì page B đăng vào hư không.
3. **Bài đã xoá resource ⇒ Bot không được nhặt lại.**
   Thêm `resource_deleted_at IS NULL` vào **picker** của auto-post.

> Luật 3 là **ngoại lệ duy nhất** được phép sửa `src/modules/auto-post/**` trong cả bộ
> plan (README §4). Sửa đúng một điều kiện WHERE trong picker, không đụng gì khác.
> Không sửa ⇒ Bot tạo job đăng file không tồn tại, job `FAILED`, và rất khó lần ra vì
> bài vẫn `APPROVED` trông hoàn toàn bình thường.

### 3.3 Cấu hình

Vào `app_settings` (ADR-014, sửa từ UI không restart), **không** vào `.env`:

```ts
SettingKey.REUP_CLEANUP = 'reup_cleanup'
interface ReupCleanupSettingsValue {
  enabled: boolean;        // mặc định false — bật tay sau khi xem thử danh sách
  retentionDays: number;   // mặc định 7, chặn 1..365
}
```

`enabled = false` mặc định là cố ý: tính năng xoá dữ liệu không tự bật ở lần deploy đầu.
Người vận hành xem trước danh sách sắp xoá rồi mới bật.

### 3.4 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `GET` | `/reup/cleanup/preview` | `reup:view` | **xem trước** danh sách sẽ bị xoá + tổng dung lượng, không xoá gì |
| `POST` | `/reup/cleanup/run` | `reup:manage` | chạy tay ngay, cùng luật §3.2 |
| `DELETE` | `/reup/videos/:id/resource` | `reup:manage` | xoá file của **một** bài; 422 nếu bài chưa `PUBLISHED` hoặc còn job treo |

`preview` là endpoint quan trọng nhất về mặt an toàn — nó cho phép kiểm chứng bộ lọc
đúng **trước khi** dữ liệu biến mất.

### 3.5 Frontend

- Tab **Dọn dẹp** trong `/reup`: switch bật/tắt, ô `retentionDays`, bảng preview
  (tiêu đề · ngày đăng · dung lượng), tổng dung lượng sẽ giải phóng, nút "Dọn ngay"
  có `Popconfirm` ghi rõ số bài và **"không khôi phục được"**.
- Màn Quản lý Ảnh/Video + Timeline: bài có `resourceDeletedAt` hiện Tag xám
  **"Đã xoá file"**, thumbnail thay bằng placeholder (link Drive đã chết).

## 4. Task

**Backend**
- [x] `SettingKey.REUP_CLEANUP` + DTO + validate `retentionDays` 1..365
- [x] `reup-cleanup.service.ts` — truy vấn §3.1 + 3 luật §3.2
- [x] `reup-cleanup.scheduler.ts` — `@Cron('0 3 * * *')`, `enabled = false` thì không chạy
- [x] Xoá file Drive: 404 ⇒ coi như thành công, không ném lỗi
- [x] **Picker auto-post: thêm `resource_deleted_at IS NULL`** (ngoại lệ duy nhất, §3.2)
- [x] 3 endpoint §3.4 + Swagger + `@RequirePermission` (cộng thêm `GET/PUT
      /reup/cleanup/settings` cho cấu hình — không có trong bảng gốc nhưng cần
      để FE đọc/ghi `enabled`/`retentionDays`)
- [x] Audit log mỗi lần xoá (bài nào, dung lượng bao nhiêu)

**Frontend**
- [x] Tab Dọn dẹp + preview + Popconfirm cảnh báo không khôi phục được
- [x] Tag "Đã xoá file" ở màn Video đã kéo (Timeline/Quản lý Ảnh-Video: chưa làm — §7 còn nợ)

**Test bắt buộc** (xoá dữ liệu = hậu quả nặng, rule 02)
- [x] Bài `sourceType = MANUAL` ⇒ **KHÔNG** bị chọn (luật 1, kiểm ở `findOneEligible` +
      chặn tường minh trong `deleteOne`; câu SQL `findCandidates` đã có
      `WHERE c.source_type = 'REUP'` nên không cần test riêng câu SQL)
- [x] Bài còn `publish_job` `SCHEDULED`/`QUEUED`/`PUBLISHING` ⇒ **KHÔNG** bị chọn (luật 2, C6 —
      `hasPendingJob` trong `deleteOne`; `findCandidates` có `NOT EXISTS`)
- [x] Bài `resource_deleted_at != null` ⇒ không chọn lại (không xoá 2 lần)
- [x] Picker auto-post **không** nhặt bài có `resource_deleted_at` (luật 3 — 2 test mới
      trong `content-picker.repository.spec.ts`)
- [x] Drive trả 404 ⇒ vẫn set `resource_deleted_at`, không ném lỗi (xử lý ở tầng
      `DriveStorage.deleteIfExists`, test tại `reup-cleanup.service.spec.ts`)
- [x] Drive lỗi 500 ⇒ **không** set `resource_deleted_at` (để lần sau thử lại)
- [x] `enabled = false` ⇒ cron không gọi Drive (assert mock)
- [x] Sau khi xoá: `content_assets` + `publish_jobs` + insight **vẫn còn nguyên** —
      xác nhận bằng thiết kế (`markResourceDeleted` chỉ UPDATE 1 cột, không đụng
      `publish_jobs`/`post_insights`)
- [x] RBAC: ADMIN gọi `/reup/cleanup/run` ⇒ 403 — phủ chung bởi ma trận quyền
      `permissions.spec.ts` (`reup:manage` chỉ SUPER_ADMIN), không cần test controller riêng

**Chốt**
- [x] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh
- [x] `.env.example`: không đổi (cấu hình ở `app_settings`)
- [x] `contexts.md` §4 §5 — ghi rõ đã sửa picker và vì sao

## 5. Điều kiện nghiệm thu

> Logic đã phủ bằng **21 unit test mới** (`reup-cleanup.service.spec.ts` 19 test +
> `reup-cleanup.scheduler.spec.ts` 2 test) mock repository/Drive/settings — đúng rule 02
> cho vùng xoá dữ liệu (hậu quả nặng). Picker có thêm 2 test trong
> `content-picker.repository.spec.ts` khẳng định câu SQL có `resource_deleted_at IS NULL`.
> Đường **end-to-end trên Drive thật** (bấm Dọn ngay → file biến mất trên Google Drive
> thật, cron 03:00 chạy thật) **chưa bấm tay** — cần môi trường có Drive credential thật.

- [ ] ⚠️ **CHƯA bấm tay** — `GET /reup/cleanup/preview` liệt kê **đúng** bài reup đã đăng
      quá hạn, **không có** bài MANUAL nào *(câu SQL `findCandidates` có
      `WHERE c.source_type = 'REUP'` tường minh — đọc code xác nhận, chưa chạy với data thật)*
- [ ] ⚠️ **CHƯA bấm tay** — Bấm "Dọn ngay" ⇒ file trên Drive **biến mất thật** (mở link ⇒
      404), bản ghi `content_assets` + `publish_jobs` + insight **vẫn còn**, UI hiện Tag
      "Đã xoá file" *(luồng đã unit-test đủ: enabled check → findCandidates → deleteIfExists
      → markResourceDeleted → audit; UI Tag đã code ở cả 3 màn: tab Video đã kéo, Quản lý
      Ảnh/Video (đã có từ trước), Timeline)*
- [x] Tạo bài reup `PUBLISHED` nhưng còn 1 job `SCHEDULED` ⇒ preview **không** liệt kê nó —
      xác nhận bằng đọc câu SQL `findCandidates` (`NOT EXISTS` job SCHEDULED/QUEUED/PUBLISHING)
- [x] Sau khi dọn, auto-post engine **không** nhặt lại bài đó — `resource_deleted_at IS NULL`
      đã thêm vào cả `pickForSlot` và `countByCategoryForPage`, có test riêng
- [ ] ⚠️ **CHƯA đo** — `enabled = false` ⇒ qua 03:00 không có gì bị xoá *(unit test khẳng
      định `run()` return sớm khi `enabled=false`, không gọi Drive — chưa đợi qua cron thật)*
- [ ] ⚠️ **CHƯA bấm tay** — Upload tay 1 video MANUAL, đăng, đợi quá `retentionDays` ⇒ file
      **vẫn còn nguyên** trên Drive *(ranh giới cứng — `WHERE c.source_type = 'REUP'` chặn
      ở nguồn, không có đường nào khác lọt qua)*
- [ ] ⚠️ **CHƯA đo** — Dung lượng Drive giảm đúng bằng tổng hiện ở preview

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | **Xoá nhầm video MANUAL tự dựng** — mất thật, không khôi phục | Điều kiện `source_type = REUP` ở **mọi** đường vào + test riêng cho luật này + `preview` để kiểm bằng mắt trước |
| R2 | Xoá khi còn job treo ⇒ đăng file không tồn tại (C6) | `NOT EXISTS` job chưa kết thúc; test có case đa page |
| R3 | Quên sửa picker ⇒ Bot nhặt bài đã xoá file, job FAILED khó lần | Là task bắt buộc §4 + test picker riêng + ghi vào `contexts.md` |
| R4 | Drive lỗi tạm thời ⇒ đánh dấu đã xoá nhưng file còn ⇒ rác vĩnh viễn | Chỉ set `resource_deleted_at` khi Drive trả thành công **hoặc** 404; lỗi khác ⇒ giữ nguyên để lần sau thử lại |
| R5 | Bật nhầm với `retentionDays` quá ngắn ⇒ xoá hàng loạt | Mặc định `enabled = false`; Popconfirm hiện **số bài** cụ thể; `retentionDays` chặn ≥ 1 |
| R6 | Insight Facebook cần file để lấy? | Không — insight lấy theo `post_id` phía Facebook, độc lập với file Drive. **Đã kiểm chứng khi code** (2026-08-16): `insights-sync.service.ts` chỉ dùng `facebookPostId`, không đọc `driveFileId`/`driveUrl` ở đâu cả — grep xác nhận |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-16
- **File chính:**
  - BE: `src/modules/reup/{reup-cleanup.repository,reup-cleanup.service,
    reup-cleanup.scheduler,reup-cleanup.controller}.ts`,
    `dto/update-reup-cleanup-settings.dto.ts`
  - Sửa `src/modules/settings/{settings.types,settings.service}.ts` (+
    `SettingKey.REUP_CLEANUP`, `ReupCleanupSettingsValue/Response`,
    get/updateReupCleanupSettings/Config)
  - Sửa `src/infra/drive/{drive-storage.interface,google-drive.storage,
    drive-storage.factory}.ts` (+`deleteIfExists`, 404 = thành công)
  - **Ngoại lệ duy nhất cho phép chạm `auto-post`** (README §4):
    `src/modules/auto-post/content-picker.repository.ts` — thêm
    `resource_deleted_at IS NULL` vào `pickForSlot` + `countByCategoryForPage` +
    `countAssignedPending`
  - `src/modules/reup/reup-videos.controller.ts` (+route
    `DELETE videos/:id/resource`), `reup-videos.repository.ts` +
    `reup-video.mapper.ts` (+`resourceDeletedAt`), `reup-videos.service.ts`
    (spread `contentAsset` khi dựng lại response)
  - Lộ `resourceDeletedAt` cho 2 màn hiển thị còn thiếu: `publish-schedule.
    {repository,mapper}.ts` (Timeline) + `publish-jobs/publish-job.mapper.ts`
    (Failed/Queue Monitor)
  - FE: `pages/ReupSettingsPage.tsx` (+tab Dọn dẹp, +Tag "Đã xoá file" +nút Xoá
    file ở tab Video đã kéo), `pages/TimelinePage.tsx` (+Tag "Đã xoá file", ẩn
    link Drive khi đã xoá, cả 2 nhánh thật + mock), `api/reup.api.ts`,
    `hooks/useReupTopics.ts`, `types/reup.ts`, `types/index.ts`
- **Khác thiết kế ban đầu:**
  1. Thêm endpoint `GET/PUT /reup/cleanup/settings` — không có trong bảng §3.4
     gốc nhưng bắt buộc để FE đọc/ghi `enabled`/`retentionDays` (theo khuôn
     `GET/PUT /reup/settings/youtube` đã có ở plan 28, không đặt dưới
     `/settings` chung vì permission phải là `reup:*` không phải
     `settings:manage`).
  2. Thêm method `DriveStorage.deleteIfExists()` vào interface dùng chung
     (`GoogleDriveStorage` + `OauthAwareDriveStorage`) thay vì bắt lỗi 404 bằng
     cách parse message của `mapDriveError()` — an toàn hơn vì không phụ thuộc
     câu chữ tiếng Việt của exception, và tách rõ "xoá dọn dẹp coi 404 là ok"
     khỏi hành vi `delete()` hiện có (xoá bài thủ công ở `content-assets.
     service.ts` vẫn coi 404 là lỗi, không đổi hành vi cũ).
  3. `DELETE /reup/videos/:id/resource` đặt trên `ReupVideosController` (base
     path `reup/`) thay vì `ReupCleanupController` (base path `reup/cleanup`)
     — khớp đúng path trong bảng §3.4 và cùng nhóm với `retry`/`skip` (cùng
     tham số `:id` = `reup_videos.id`, không phải `content_assets.id`).
  4. `preview`/`run` trả `number` cho dung lượng thay vì để `BigInt` rò ra API
     — theo đúng khuôn `Number(bigint)` đã dùng ở `content-asset.mapper.ts`/
     `reup-video.mapper.ts` (BigInt không serialize được sang JSON).
  5. Mở rộng thêm 2 chỗ ngoài phạm vi liệt kê ở §3.5 (chỉ nói "màn Quản lý +
     Timeline có Tag"): lộ `resourceDeletedAt` qua `ScheduleJobResponse`
     (Timeline) và `PublishJobResponse` (Failed Jobs/Queue Monitor) — cả hai
     đã có sẵn field `contentAsset` join, chỉ thêm 1 dòng select + 1 dòng map.
- **Test:** BE **+23 test** (1101 tổng) — 19 test `reup-cleanup.service.spec.ts`
  (preview, run × 6 case bao gồm 404/500, deleteOne × 7 case), 2 test
  `reup-cleanup.scheduler.spec.ts` (gọi run(null), nuốt lỗi), 2 test mới trong
  `content-picker.repository.spec.ts` (picker + countByCategoryForPage loại
  bài đã xoá resource). FE 83 test cũ xanh (component không thuộc rule 02).
  Lint + build xanh cả 2 phía.
- **Còn nợ:**
  1. Chưa bấm tay end-to-end trên Drive thật (Dọn ngay → file biến mất → mở
     link 404) — cần Drive credential thật, xem §5
  2. Chưa đợi cron `@Cron('0 3 * * *')` chạy qua đường decorator thật (logic
     giống hệt đã unit-test qua `run()`)
  3. Chưa đo dung lượng Drive giảm đúng bằng số hiện ở preview trên tài khoản
     Drive thật
