# Plan 23 — Upload media qua hàng đợi (song song, không chặn UI)

**Milestone:** Phase 2
**Trạng thái:** ⬜ chưa làm (đang ở bước thiết kế, chờ user confirm mới code)
**Phụ thuộc:** Plan 03 (Google Drive upload, DONE), Plan 04 (content-assets, DONE),
Plan 07 (auto-post engine — nguồn của pattern BullMQ trong repo), Plan 13 (Monitor —
nguồn của pattern UI "job đang chờ/đang chạy"), **Plan 22 (nhiều ảnh trong 1
content_assets record) — BẮT BUỘC xong trước, vì `POST /media/upload-jobs` ở plan
này phải nhận N file/1 job ngay từ đầu (mediaType=image), không phải sửa lại sau**
**Spec tham chiếu:** `docs/08-bullmq.md` (quy ước queue chung — tài liệu này mới chỉ mô
tả queue `publish-facebook`, plan này **mở rộng cùng quy ước** cho queue mới, không sửa
`docs/08`), `docs/04-api-spec.md` §POST /media/upload, §content-assets

---

## 0. Quyết định kiến trúc (đã chốt với user)

Đã hỏi user 1 câu chốt hướng: **queue thật ở backend (BullMQ)**, không phải hàng đợi
giả phía trình duyệt. Kèm yêu cầu bổ sung: giới hạn số file đẩy lên Drive đồng thời
(gọi là "chunking" theo lời user) — **hiện thực bằng `concurrency` của BullMQ worker**
(cửa sổ trượt N job chạy song song, job xong là job kế tiếp trong hàng đợi được nhận
ngay — không phải chờ "hết nguyên 1 lô 5 file" mới chạy lô sau, hiệu quả hơn mà vẫn giữ
đúng giới hạn N tại mọi thời điểm).

**Hệ quả quan trọng — đảo ngược 1 quyết định kiến trúc cũ:** `PLAN-MVP.md` §4 ghi
"Video lớn gây OOM → Chỉ stream, không ghi file xuống disk". Để một BullMQ worker xử lý
file *sau khi* HTTP request đã trả response, file **bắt buộc phải tồn tại ngoài vòng đời
request** — tức phải ghi tạm xuống đĩa. Plan này chấp nhận đánh đổi đó, có kiểm soát
(dir riêng, dọn theo TTL, xem §6 Rủi ro) — user đã đồng ý hướng này.

## 1. Mục tiêu

Cho phép user bấm "Upload" nhiều ảnh/video liên tiếp mà **không phải đợi từng file đăng
xong Drive mới được bấm tiếp**. Sau khi trình duyệt gửi xong file lên server (progress
0→100% như hiện tại), phần "đẩy lên Google Drive + tạo bản ghi content" chuyển thành
job nền chạy trong hàng đợi (tối đa N job cùng lúc, N cấu hình qua env). Trong lúc chờ
xử lý, dòng bài viết hiện "mờ" trong bảng Quản lý Ảnh/Video kèm trạng thái, giống hệt
cách `/queue` (Queue Monitor) hiện job "đang chờ / đang đăng" cho `publish_jobs`.

## 2. Ngoài phạm vi

- Upload chunked/resumable **từ trình duyệt** (mất mạng giữa chừng vẫn phải chọn lại
  file từ đầu). Chỉ đoạn "server → Drive" mới chạy qua hàng đợi/retry được.
- Huỷ job đang chạy dở (mid-flight cancel khi đã sang `UPLOADING_TO_DRIVE`) — chỉ huỷ
  được job còn `QUEUED`.
- Đổi hành vi `MAX_UPLOAD_MB` / màn Settings — giữ nguyên, chỉ đổi **thời điểm** check
  (server-side, ngay khi nhận xong file, trước khi tạo job — không đổi ngưỡng/nguồn).
- Sửa `DriveStorage.upload()` để nhận stream thay vì `Buffer` — xem giới hạn ở §6, để
  lại làm nợ kỹ thuật riêng nếu cần tối ưu RAM sâu hơn.
- Áp dụng cơ chế này cho publish (đăng lên Facebook) — plan 07/09/20 đã có queue riêng,
  không đụng vào.

## 3. Thiết kế

> **Cần khớp với Plan 22 (làm trước):** khi `mediaType=image`, `POST
> /media/upload-jobs` phải nhận **N file trong 1 request/1 job** (không phải 1
> file/job như bản nháp ban đầu) — ảnh đầu tiên tạo `ContentAsset`, các ảnh còn
> lại tạo `ContentAssetFile` (position >= 1) khi worker xử lý xong. `metadata`
> JSON của `MediaUploadJob` không đổi (vẫn 1 bộ title/category/caption/... dùng
> chung cho cả nhóm ảnh). Video vẫn luôn 1 file/job (Facebook không ghép album
> video — giữ nguyên giới hạn cũ của plan 21/22). Phần dưới đây viết theo giả
> định 1 file/job từ bản nháp gốc — **sẽ rà soát lại chi tiết từng đoạn khi bắt
> tay code**, không rewrite toàn bộ ngay bây giờ để tránh làm 2 lần.

### 3.1 Luồng dữ liệu

```text
1. FE: submit form (title/category/caption/hashtags/assignedPageIds/editorId + file)
   → multipart POST /media/upload-jobs qua apiUpload() (đã có sẵn, progress % thật)

2. BE — CHẶN SỚM bằng 1 Guard riêng (chạy TRƯỚC interceptor của multer trong vòng
   đời request Nest — xem §3.1b): đếm job đang QUEUED/UPLOADING_TO_DRIVE (toàn hệ
   thống, không riêng theo user) >= MEDIA_UPLOAD_MAX_PENDING_JOBS (mặc định 20) →
   503 "Hệ thống đang xử lý tối đa số file upload cho phép, vui lòng thử lại sau"
   NGAY, multer còn chưa kịp nhận byte nào — không tốn băng thông/đĩa cho 1 request
   chắc chắn bị từ chối.

3. BE controller (chỉ chạy khi qua được bước 2):
   - Validate DTO (400 nếu thiếu field) + permission content:create
   - Multer chuyển từ memoryStorage() → diskStorage() ghi thẳng xuống
     MEDIA_UPLOAD_TMP_DIR/<uuid>-<originalname> (không qua buffer RAM — nhân tiện
     sửa luôn điểm chưa tối ưu hiện tại: media.service.ts đang buffer nguyên file
     vào RAM rồi mới check size)
   - Check size (đọc maxUploadMb ĐỘNG từ SettingsService như media.service.ts đang
     làm) — vượt giới hạn thì xoá file tạm, trả 400 NGAY, không tạo job
   - Tạo MediaUploadJob (status=QUEUED, metadata = JSON của các field form)
   - queue.add('media-upload', { mediaUploadJobId }, { jobId: `media-upload-${id}`,
     attempts: 3, backoff: exponential 30s, removeOnComplete: 100, removeOnFail: false })
   - Trả 202 { id, status: 'QUEUED' } NGAY — không đợi Drive

4. FE nhận 202 → đóng modal + reset form ngay (bấm Upload tiếp được luôn) → chèn 1
   dòng "mờ" vào bảng content list ứng với job này. Nhận 503 ở bước 2 → toast rõ
   ràng "Hệ thống đang xử lý tối đa X file, thử lại sau" — KHÔNG đóng modal, giữ
   nguyên file đã chọn để user bấm thử lại ngay không phải chọn lại file.

5. FE poll GET /media/upload-jobs?mine=true (interval ~3s, chỉ chạy khi có job chưa
   kết thúc — dừng poll khi rỗng, giống useMonitor) → cập nhật trạng thái dòng mờ.

6. Worker (MediaUploadProcessor, concurrency = MEDIA_UPLOAD_CONCURRENCY):
   - set status=UPLOADING_TO_DRIVE
   - đọc file tạm (fs.readFile) → DriveStorageFactory.get().upload()
   - gọi lại đúng logic tạo ContentAsset đang dùng ở POST /content-assets (tách
     thành hàm dùng chung, KHÔNG viết lại lần 2 — xem §3.3) với actor = người tạo
     job, resolve mediaType từ mimeType như MediaService đang làm
   - set status=SUCCESS + contentAssetId, xoá file tạm, audit CONTENT_UPLOAD
     (giữ nguyên hành vi audit hiện có)
   - Lỗi bất kỳ bước nào → status=FAILED + errorMessage, GIỮ file tạm (để "Thử lại"
     không bắt user chọn lại file)

7. FE thấy job SUCCESS → invalidate content-assets query (dòng thật thay dòng mờ) +
   toast; thấy FAILED → dòng mờ đổi màu lỗi + nút "Thử lại" (POST retry) ngay tại chỗ,
   không bắt mở lại form.
```

### 3.1b Guard giới hạn 20 job chạy ngầm (theo yêu cầu user)

`MediaUploadLimitGuard` (implements `CanActivate`) đăng trên route `POST
/media/upload-jobs`, gắn ở tầng Guard (chạy trước `FileInterceptor`/multer trong
pipeline của Nest: Middleware → **Guard** → Interceptor(before) → Pipe → Handler) —
đây là lý do bắt buộc dùng Guard chứ không check trong body controller: check
trong controller thì multer **đã** nhận xong toàn bộ file rồi mới bị từ chối, vừa
tốn băng thông vừa tốn đĩa cho 1 request chắc chắn hỏng.

- `COUNT(*) FROM media_upload_jobs WHERE status IN ('QUEUED', 'UPLOADING_TO_DRIVE')`
  — đếm toàn hệ thống (không riêng theo user, vì tài nguyên chia sẻ chung là RAM/đĩa
  của cả server, giới hạn theo per-user sẽ không bảo vệ được tài nguyên thật).
- Ngưỡng `MEDIA_UPLOAD_MAX_PENDING_JOBS` (mặc định 20, xem §3.5) — 20 là con số user
  chọn, KHÔNG phải dựa theo tính toán RAM/đĩa (xem lại phần thảo luận RAM ở trên: với
  `MEDIA_UPLOAD_CONCURRENCY=3` thì tại một thời điểm chỉ tối đa 3 job thật sự đọc file
  vào RAM để đẩy Drive, 17 job còn lại chỉ là 1 dòng DB + 1 file nằm im trên đĩa —
  không tốn RAM. Rủi ro thật của "20 job cùng chờ" là **dung lượng đĩa**: 20 × 300MB
  = 6GB, an toàn so với ~65-75GB đĩa trống ước tính, nhưng nếu file trung bình lớn
  hơn hoặc đĩa còn ít hơn ước tính thì 20 vẫn hợp lý làm mốc khởi điểm — chỉnh qua
  env, không cần sửa code.
- Vượt ngưỡng → `ThrottlerException`-style 503 kèm message tiếng Việt rõ ràng, theo
  đúng bảng exception ở `01-coding-standards.md` (đây không khớp cột nào có sẵn —
  gần nhất là quy tắc nghiệp vụ chéo, dùng `ServiceUnavailableException` (503) vì
  đây là quá tải tạm thời, không phải lỗi input của request này).

### 3.2 Schema mới (`schema.prisma` — nhớ cập nhật `erd.md` cùng lúc, rule 05)

```prisma
enum MediaUploadStatus {
  QUEUED
  UPLOADING_TO_DRIVE
  SUCCESS
  FAILED
}

model MediaUploadJob {
  id               String            @id @default(uuid()) @db.Uuid
  status           MediaUploadStatus @default(QUEUED)
  originalFilename String            @map("original_filename")
  mimeType         String            @map("mime_type")
  fileSize         BigInt            @map("file_size")
  tempFilePath     String?           @map("temp_file_path") // null sau khi dọn
  metadata         Json              // title/category/caption/hashtags/assignedPageIds/editorId lúc submit
  errorMessage     String?           @map("error_message") @db.Text
  attemptCount     Int               @default(0) @map("attempt_count")
  bullJobId        String?           @map("bull_job_id")
  contentAssetId   String?           @map("content_asset_id") @db.Uuid
  createdById      String            @map("created_by") @db.Uuid
  createdAt        DateTime          @default(now()) @map("created_at")
  updatedAt        DateTime          @updatedAt @map("updated_at")

  contentAsset ContentAsset? @relation(fields: [contentAssetId], references: [id])
  createdBy    User          @relation(fields: [createdById], references: [id])

  @@index([status])
  @@index([createdById, status]) // FE poll "job của tôi"
  @@map("media_upload_jobs")
}
```

Cần thêm quan hệ ngược `mediaUploadJobs MediaUploadJob[]` vào `ContentAsset` và `User`.

### 3.3 Tránh trùng logic tạo ContentAsset

`ContentAssetsService.create()` hiện nhận `CreateContentAssetDto` (đã có `driveFileId`
sẵn — do FE gọi `/media/upload` trước rồi mới gọi cái này). Tách phần logic **sau khi
đã có driveFileId** (auto-approve nếu actor là ADMIN, ghi audit, tạo assignment) thành
1 method dùng chung, gọi từ cả:
- `ContentAssetsController.create()` (giữ nguyên cho trường hợp khác nếu còn dùng), và
- `MediaUploadProcessor` (truyền thẳng object thay vì đi qua DTO/HTTP).

Không giữ 2 bản logic tạo content asset.

### 3.4 Endpoint mới (module `media-upload-jobs`, tách khỏi `media` module hiện có)

| Method | Path | Quyền | Việc |
|--------|------|-------|------|
| POST | `/media/upload-jobs` | `content:create` | Multipart file + field form → tạo job, trả 202. Gác thêm `MediaUploadLimitGuard` (§3.1b) — 503 nếu đã đủ `MEDIA_UPLOAD_MAX_PENDING_JOBS` job đang chạy ngầm |
| GET | `/media/upload-jobs` | `content:create` | List job của actor hiện tại (CONTENT chỉ thấy của mình, ADMIN/EDITOR theo đúng scope content hiện có), filter `status` |
| POST | `/media/upload-jobs/:id/retry` | chủ job hoặc ADMIN | Job FAILED + còn file tạm → enqueue lại (đi qua lại `MediaUploadLimitGuard`) |

`POST /media/upload` (endpoint cũ) **giữ nguyên** — không xoá, vẫn có thể cần cho use
case khác; chỉ `ContentManagementPage` đổi sang gọi endpoint mới.

### 3.5 Env mới (`backend/.env.example` — cập nhật cùng commit, rule 04)

```bash
# ── Upload media qua hàng đợi (plan 22) ──────────────────────────
# Nơi lưu tạm file đang chờ đẩy lên Drive. KHÁC MEDIA_CACHE_DIR — dir đó bị
# MediaCacheService xoá sạch mỗi lần boot, không dùng chung được.
MEDIA_UPLOAD_TMP_DIR=
# Số file đẩy lên Drive đồng thời tối đa (mỗi job đọc hết file vào RAM trước khi
# gọi Drive API — xem giới hạn ở §6). User yêu cầu khoảng 3-5, mặc định 3.
MEDIA_UPLOAD_CONCURRENCY=3
# Giữ file tạm + job SUCCESS/FAILED bao lâu trước khi dọn (ms) — đủ để bấm "Thử lại".
MEDIA_UPLOAD_JOB_RETENTION_MS=86400000
# Số job QUEUED/UPLOADING_TO_DRIVE tối đa cùng lúc trên toàn hệ thống (không phải
# per-user) — vượt ngưỡng thì từ chối nhận file mới ngay từ Guard, chưa kịp ghi đĩa.
MEDIA_UPLOAD_MAX_PENDING_JOBS=20
```

### 3.6 Frontend

- `api/mediaUploadJobs.api.ts`: `create(values, file, onProgress)` (multipart, tái
  dùng `apiUpload` đã có), `list(params)`, `retry(id)`.
- `hooks/useMediaUploadJobs.ts`: React Query, `refetchInterval` ngắn (~3s) NHƯNG chỉ
  bật khi có ít nhất 1 job active trong cache trước đó (tránh poll vô ích khi không ai
  đang upload) — cùng tinh thần `useMonitor`.
- `ContentManagementPage.tsx`:
  - `handleCreate` gọi `mediaUploadJobsApi.create()` thay vì `mediaApi.upload()` +
    `createMutation`. Đóng modal + reset ngay khi nhận 202 (không chờ nữa).
  - Merge danh sách `content` (từ `useContentAssets`) với job active/gần-đây từ
    `useMediaUploadJobs` để render dòng "mờ" (dùng lại `Progress`/`Tag` như
    `QueueMonitorPage` đang làm, không tự chế mới — rule 01 FE).
  - Job SUCCESS → invalidate `content-assets` (dòng thật thay dòng mờ), job FAILED →
    dòng mờ hiện lỗi + nút "Thử lại" gọi thẳng `retry(id)`.

## 4. Task

- [ ] Migration: enum `MediaUploadStatus` + bảng `media_upload_jobs` + quan hệ ngược
- [ ] Cập nhật `erd.md` (bảng mới, enum mới, index, lịch sử thay đổi) — cùng lúc với
      migration, không để "sau"
- [ ] `MediaController`: đổi `FileInterceptor` sang `diskStorage()`, giữ endpoint cũ
- [ ] Tách helper tạo ContentAsset dùng chung (§3.3), viết test cho helper này
- [ ] Module `media-upload-jobs`: repository/service/controller/processor theo đúng
      cấu trúc rule 01 (Controller mỏng, Service không đụng Prisma trực tiếp)
- [ ] `MediaUploadProcessor`: đọc `MEDIA_UPLOAD_CONCURRENCY` từ `AppConfigService`, set
      qua `this.worker.concurrency` trong `onModuleInit` (decorator `@Processor` không
      nhận giá trị async)
- [ ] `onModuleInit` của service mới: mọi job còn `QUEUED`/`UPLOADING_TO_DRIVE` từ phiên
      trước → set `FAILED` + dọn file tạm liên quan (không cố resume, đúng tinh thần MVP)
- [ ] Cron/TTL dọn file tạm + job terminal quá `MEDIA_UPLOAD_JOB_RETENTION_MS`
- [ ] `MediaUploadLimitGuard` (§3.1b) — đếm `QUEUED`+`UPLOADING_TO_DRIVE`, gắn TRƯỚC
      `FileInterceptor` trên route `POST /media/upload-jobs` (và route retry)
- [ ] 3 endpoint mới + DTO + Swagger
- [ ] Unit test: guard 20 job (đúng 20 → chặn, 19 → cho qua, đếm đúng cả 2 status
      QUEUED/UPLOADING_TO_DRIVE), check size trước khi tạo job, chuyển trạng thái
      QUEUED→UPLOADING→SUCCESS/FAILED, retry chỉ cho FAILED, RBAC list "chỉ thấy job
      của mình" (đây là logic dễ sai — nên test kỹ dù không phải auto-post/crypto,
      theo tinh thần rule 02)
- [ ] FE: `api/mediaUploadJobs.api.ts`, `hooks/useMediaUploadJobs.ts`
- [ ] FE: `ContentManagementPage` — modal fire-and-forget + dòng mờ + nút "Thử lại" +
      toast rõ ràng khi dính 503 quá tải (giữ nguyên file đã chọn, không đóng modal)
- [ ] `npm run lint && npm run build` xanh 2 phía (+ `npm run test` phần đã viết)
- [ ] Cập nhật `.env.example` (4 biến mới, §3.5)
- [ ] Cập nhật `contexts.md`
- [ ] Ghi nợ kỹ thuật vào `contexts.md` §6: `docs/08-bullmq.md` mới chỉ mô tả queue
      `publish-facebook`, có thể cần bổ sung mục cho `media-upload` sau — không tự sửa
      `docs/` theo rule 00

## 5. Điều kiện nghiệm thu

- [ ] Mở modal Upload, submit file A → modal đóng ngay (không đợi Drive), bảng hiện
      dòng "mờ" cho A
- [ ] Trong lúc A còn "mờ", mở modal lần nữa, submit file B → cả A và B cùng "mờ" một
      lúc, tối đa `MEDIA_UPLOAD_CONCURRENCY` job thật sự chạy song song ở tầng Drive
      (job thứ N+1 nằm QUEUED chờ tới lượt)
- [ ] A xong trước → dòng A tự chuyển thành bản ghi thật (PENDING_REVIEW/APPROVED),
      dòng B vẫn "mờ" cho tới khi xong
- [ ] Rút mạng/tắt Drive credential giữa chừng → job FAILED, dòng hiện lỗi + nút "Thử
      lại" hoạt động mà KHÔNG bắt chọn lại file
- [ ] File vượt `maxUploadMb` → 400 ngay lúc submit, không tạo job "mờ" nào cả
- [ ] Restart backend khi có job đang `UPLOADING_TO_DRIVE` → job đó tự chuyển `FAILED`
      với message rõ ràng, không kẹt mãi mãi
- [ ] CONTENT role chỉ thấy job upload của chính mình ở danh sách poll
- [ ] Đã có đúng 20 job `QUEUED`/`UPLOADING_TO_DRIVE`, submit file thứ 21 → 503 "Hệ
      thống đang xử lý tối đa số file upload cho phép, vui lòng thử lại sau" NGAY,
      file KHÔNG được ghi xuống đĩa, KHÔNG tạo job mới, modal không tự đóng

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Ghi file tạm ra đĩa — đảo ngược quyết định "chỉ stream" cũ (PLAN-MVP §4) | Dir riêng `MEDIA_UPLOAD_TMP_DIR` (không chung với `MEDIA_CACHE_DIR` bị xoá sạch mỗi boot), dọn theo TTL + dọn theo từng job lúc restart; **`MEDIA_UPLOAD_MAX_PENDING_JOBS=20` (§3.1b) chặn số job chạy ngầm cùng lúc ⇒ trần đĩa tạm ≈ 20 × file lớn nhất, không phình vô hạn** |
| `DriveStorage.upload()` chỉ nhận `Buffer`, chưa hỗ trợ stream ⇒ mỗi job đọc hết file vào RAM lúc đẩy Drive | Giới hạn `MEDIA_UPLOAD_CONCURRENCY` thấp (mặc định 3) để RAM đỉnh ≈ concurrency × file lớn nhất; không sửa interface Drive trong phạm vi plan này (nợ kỹ thuật riêng nếu cần) |
| Worker chết giữa chừng, job kẹt `UPLOADING_TO_DRIVE` | `onModuleInit` quét job non-terminal từ phiên trước → `FAILED` + dọn file, không cố resume |
| File tạm của job `FAILED` tồn đọng lâu ⇒ đầy đĩa | Cron dọn theo `MEDIA_UPLOAD_JOB_RETENTION_MS`, xoá file (và tuỳ chọn xoá job row) sau mốc đó |
| Trùng logic tạo ContentAsset giữa endpoint cũ và worker mới | Bắt buộc tách hàm dùng chung (§3.3), review kỹ khi merge — không viết lại lần 2 |
| `docs/08-bullmq.md` chưa mô tả queue thứ 2 | Không tự sửa `docs/`, chỉ ghi nợ vào `contexts.md` §6 theo rule 00 |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:** N test · coverage service ?%
- **Còn nợ:**
