# Plan 29 — Cron reup: tìm → tải → Drive → `content_assets`

**Milestone:** M12 · **Trạng thái:** ✅ xong 2026-08-16 (chưa test cron thật lúc 02:00)
**Phụ thuộc:** [28-downloader-bridge.md](./28-downloader-bridge.md) **phải nghiệm thu xong**
**Spec tham chiếu:** không có — plan này là spec tạm
**Bản đồ:** [README.md](./README.md) (QĐ-3, QĐ-5)

---

## 1. Mục tiêu

Nối 3 mảnh rời của plan 27 + 28 thành một dây chuyền tự chạy: mỗi ngày cron đọc chủ đề
ACTIVE, tìm video mới trên YouTube, chọn N video theo `dailyQuota`, tải về, đẩy lên Drive
qua **ống `MediaUploadJob` có sẵn**, tạo `content_assets` loại `REUP`.

Sau plan này, auto-post engine (không sửa dòng nào) sẽ tự nhặt bài reup đăng lên page.
Đây là plan biến cả bộ từ "công cụ rời" thành "chạy tự động".

## 2. Ngoài phạm vi

- **Không sửa auto-post engine** (`src/modules/auto-post/**`). Ranh giới cứng README §4.
- **Không** xoá file sau khi đăng — plan 30.
- **Không** implement Douyin/TikTok ⇒ `SKIPPED/PLATFORM_NOT_SUPPORTED`.
- **Không** viết đường upload Drive thứ hai (QĐ-3).
- **Không** làm retry thủ công hàng loạt / màn quản trị job reup phức tạp. Nút "Thử lại"
  một video là đủ.

## 3. Thiết kế

### 3.1 Hai giai đoạn, hai cơ chế — cố ý tách

```text
Cron A (đồng bộ, nhanh, 1 lần/ngày 02:00)     ← chỉ TÌM, không tải
   claim reup_runs UNIQUE(topic_id, run_date)
   → port.search() → lọc → tạo reup_videos (PENDING) → enqueue BullMQ

Queue "reup-download" (nền, chậm, mỗi video 1 job)   ← TẢI + UPLOAD
   PENDING → DOWNLOADING → DOWNLOADED → UPLOADING → IMPORTED
```

Lý do tách: tải video mất vài phút/video và hay hỏng. Nhét vào cron ⇒ một video hỏng
kéo sập cả lượt quét của mọi chủ đề, và cron chạy quá lâu sẽ chồng tick. Queue có sẵn
retry/backoff của BullMQ — dùng lại thay vì tự viết.

### 3.2 Cron A — discovery

`@Cron('0 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })`

```text
for each topic in reup_topics WHERE is_active = true:
  1. CLAIM: INSERT reup_runs (topic_id, run_date=hôm nay) — UNIQUE vi phạm ⇒ bỏ qua
            topic này (đã có tick khác chạy). Đây là chống double-fire, khuôn ADR-006.
  2. Nếu platform != YOUTUBE  ⇒ SKIPPED/PLATFORM_NOT_SUPPORTED
  3. Nếu downloader vắng mặt  ⇒ SKIPPED/DOWNLOADER_UNAVAILABLE   (QĐ-6, plan 28 §3.3b)
     — kiểm bằng checkAvailability(), log 1 dòng WARN, KHÔNG crash cron
  4. Nếu chưa cấu hình API key ⇒ SKIPPED/NOT_CONFIGURED   (không gọi API, không spam log)
  5. Nếu quota hôm nay đã vượt ⇒ SKIPPED/QUOTA_EXCEEDED   (không gọi API rồi mới ăn 403)
  6. port.search(keywords, regionCode, publishedAfter = now - maxAgeDays)
  7. LỌC (thứ tự này quan trọng — rẻ trước, đắt sau):
       a. externalId đã có trong reup_videos  ⇒ loại   ← CHỐNG TRÙNG
       b. viewCount < minViewCount            ⇒ loại
       c. durationSec ngoài [min, max]        ⇒ loại
       d. publishedAt cũ hơn maxAgeDays       ⇒ loại
  8. Sắp xếp viewCount DESC, lấy top = topic.dailyQuota
  9. INSERT reup_videos (PENDING) + enqueue job "reup-download"
 10. Đóng sổ run: DONE (found_count, picked_count) | SKIPPED | ERROR
```

**Quota YouTube** — `search.list` = 100 units/lần, trần 10.000/ngày. Với 20 chủ đề ×
1 lần/ngày = 2.000 units ⇒ dư sức. Nhưng vẫn phải cộng dồn `quota_used` theo ngày và
chặn **trước khi gọi**, vì "Quét ngay" bấm tay không giới hạn số lần.

⇒ Thêm cột `quotaUsed Int @default(0)` vào `reup_runs` (migration nhỏ, nhớ `erd.md`).

**Chặn số chủ đề ACTIVE ≤ 20** ở service ⇒ vượt thì `UnprocessableEntityException` với
message nói rõ phải tắt bớt.

### 3.3 Queue "reup-download" — processor

Mỗi job = 1 `reupVideoId`. `concurrency = 2` (config) — tải video ăn băng thông và đĩa,
chạy song song nhiều là tự bắn vào chân.

```text
1. reup_videos → DOWNLOADING
2. port.download(url, outDir = <REUP_TMP_DIR>/<reupVideoId>/)   ← duy nhất theo job (C5)
3. → DOWNLOADED, lưu local_path, file_size
4. Tạo MediaUploadJob (source = REUP) với metadata dựng từ topic:
       title    = video.title (cắt còn ≤ giới hạn)
       category = topic.category
       caption  = topic.captionTemplate thay {title} → video.title
                  (rỗng ⇒ dùng video.title)
       hashtags = topic.hashtags
       mediaType = video
   → worker media-upload có sẵn đẩy lên Drive + tạo content_assets   (QĐ-3)
5. → UPLOADING, lưu media_upload_job_id
6. Khi MediaUploadJob SUCCESS:
       - set content_assets.source_type = REUP
       - set content_assets.status = topic.autoApprove ? APPROVED : PENDING_REVIEW
       - reup_videos → IMPORTED, lưu content_asset_id
       - XOÁ file tạm ở local_path, set local_path = null
7. Lỗi bất kỳ ⇒ reup_videos → FAILED + error_message + attempt_count++
   BullMQ retry 3 lần backoff mũ; hết lượt ⇒ dừng, hiện trên UI để bấm tay
```

**Điểm nối bước 6 là chỗ dễ sai nhất.** `MediaUploadJob` hiện chạy bất đồng bộ và tự
tạo `content_assets`. Hai cách nối:

- **(a)** `MediaUploadJob` thêm cột `reupVideoId` nullable; worker media-upload sau khi
  tạo `content_assets` thì gọi callback cập nhật `reup_videos`.
- **(b)** Reup processor tự poll trạng thái `MediaUploadJob`.

**Chọn (a)** — poll là lãng phí và trễ. Chi phí là thêm 1 cột nullable + 1 nhánh `if`
trong worker có sẵn; đổi lại luồng đi thẳng, không có vòng chờ.

> Đây là thay đổi **duy nhất** được phép chạm vào module `media-upload-jobs`. Phải giữ
> nhánh `reupVideoId = null` chạy y như cũ — test hồi quy cho upload tay bắt buộc.

`sourceType = REUP` **phải** set ngay lúc tạo `content_assets`, không phải UPDATE sau —
nếu update sau, có khoảng thời gian bài reup lọt vào màn Quản lý Ảnh/Video (§27 3.2).

### 3.4 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `POST` | `/reup/topics/:id/discover-now` | `reup:manage` | quét tay, **vẫn qua claim** ⇒ bấm 2 lần chỉ 1 run |
| `GET` | `/reup/videos` | `reup:view` | filter topic/status, phân trang |
| `POST` | `/reup/videos/:id/retry` | `reup:manage` | chỉ khi `FAILED`; reset về PENDING + enqueue |
| `DELETE` | `/reup/videos/:id` | `reup:manage` | bỏ qua video (`SKIPPED`), **giữ** externalId để không dò lại |
| `GET` | `/reup/runs` | `reup:view` | nhật ký + quota đã tiêu hôm nay |

### 3.5 Frontend — 2 tab còn lại của `/reup`

Tab **Video đã kéo**: bảng thumbnail · tiêu đề · kênh gốc · view · trạng thái (Tag màu
theo `ReupVideoStatus`) · link nguồn · link tới bài trong kho (khi `IMPORTED`) · nút
Thử lại (khi `FAILED`) / Bỏ qua.

Tab **Nhật ký quét**: bảng `reup_runs` — ngày · chủ đề · trạng thái · tìm được/chọn ·
lý do skip · quota. Panel trên cùng: quota YouTube còn lại hôm nay.

Nút **Quét ngay** trên từng chủ đề ở tab Chủ đề.

Trạng thái `FAILED` phải hiện `errorMessage` bằng tiếng Việt dễ hiểu — người vận hành
cần biết "video bị gỡ" khác "hết quota".

## 4. Task

**Backend — nền**
- [x] Migration: `reup_runs.quota_used`, `media_upload_jobs.reup_video_id`,
      `MediaUploadSource` thêm `REUP` — **`erd.md` cùng thay đổi** (rule 05)
- [x] `reup-videos.repository.ts` · `reup-runs.repository.ts`

**Backend — logic**
- [x] `reup-discovery.scheduler.ts` — Cron A + claim + quota guard (§3.2)
- [x] `reup-filter.ts` — **hàm thuần** lọc + xếp hạng + cắt theo `dailyQuota` (test bắt buộc)
- [x] `reup-download.processor.ts` + queue `reup-download` (concurrency config)
- [x] Nối callback trong worker `media-upload` khi `reupVideoId != null` (§3.3, cách a)
- [x] Set `sourceType = REUP` + status theo `autoApprove` **ngay lúc tạo** `content_assets`
- [x] Xoá file tạm sau khi lên Drive thành công
- [x] Chặn > 20 chủ đề ACTIVE (422)
- [x] Endpoint §3.4 + DTO + Swagger + `@RequirePermission`

**Frontend**
- [x] Tab Video đã kéo + tab Nhật ký quét (thay placeholder plan 27)
- [x] Nút Quét ngay / Thử lại / Bỏ qua + `invalidateQueries`
- [x] Panel quota còn lại + banner khi chưa cấu hình API key → link `/settings`

**Test bắt buộc** (đây là vùng "auto-post-like": picker + chống double-fire — rule 02)
- [x] `reup-filter`: loại video đã có `externalId` · dưới `minViewCount` · sai duration ·
      quá `maxAgeDays` · lấy **đúng** `dailyQuota` video · hết video ⇒ mảng rỗng
- [x] Double-fire: gọi discover 2 lần cùng topic/ngày ⇒ **1** dòng `reup_runs`, **không**
      tạo video lần 2
- [x] Quota vượt ngưỡng ⇒ `SKIPPED/QUOTA_EXCEEDED`, port `search` **không** được gọi (mock)
- [x] Chưa cấu hình key ⇒ `SKIPPED/NOT_CONFIGURED`, không gọi port
- [x] `platform = DOUYIN` ⇒ `SKIPPED/PLATFORM_NOT_SUPPORTED`, không gọi port
- [x] **Downloader vắng mặt ⇒ `SKIPPED/DOWNLOADER_UNAVAILABLE`**, cron đóng sổ bình
      thường, **không** ném lỗi ra ngoài module reup (QĐ-6)
- [x] Downloader vắng mặt ⇒ cron của **auto-post** vẫn chạy đủ chu kỳ (không lây)
- [x] `autoApprove = true` ⇒ `content_assets.status = APPROVED`; `false` ⇒ `PENDING_REVIEW`
- [x] `content_assets` tạo ra có `sourceType = REUP` **ngay từ đầu**
- [x] Download lỗi ⇒ `reup_videos.FAILED` + `errorMessage`, file tạm được dọn
- [x] **Hồi quy:** `MediaUploadJob` với `reupVideoId = null` (upload tay) chạy y như cũ
- [x] RBAC: ADMIN gọi `/reup/videos` ⇒ 403

**Chốt**
- [x] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh
- [x] `.env.example`: thêm `REUP_DOWNLOAD_CONCURRENCY` nếu có
- [x] `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

> Logic đã phủ bằng **74 unit test** (mock port/repository/queue — đúng rule 02 cho vùng
> picker + chống double-fire). Cầu nối Python→API đã đo **thật** (5 video YouTube thật
> qua `yt-search`). Đường **end-to-end đủ chuỗi** (bấm Quét ngay trên UI thật → file lên
> Drive thật → bài vào kho → auto-post đăng lên Page thật) **chưa bấm tay** — cần
> `REUP_PYTHON_BIN`/`REUP_PROJECT_DIR` trong `.env` (việc của bạn, xem
> `ISSUES-TO-REVIEW.md` mục V1) rồi mới chạy được trọn đường.

- [ ] ⚠️ **CHƯA bấm tay** — Tạo chủ đề quota 2 ⇒ Quét ngay ⇒ `/reup/runs` có 1 dòng DONE,
      tab Video có đúng 2 video *(luồng đã unit-test đủ: claim → search → filter → create
      → enqueue, 21 test `reup-discovery.service.spec.ts`)*
- [ ] ⚠️ **CHƯA bấm tay** — 2 video `IMPORTED`, file có thật trên Drive, kho có 2 bài
      `sourceType=REUP` *(luồng download→media-upload đã unit-test: 19 test
      `reup-download.service.spec.ts` + 8 test hook `reup-media.hook.spec.ts`)*
- [x] Màn Quản lý Ảnh/Video không thấy bài REUP; màn Reup thì thấy — **đã xác minh ở
      plan 27** (không đổi gì thêm ở plan 29)
- [x] `autoApprove` quyết định `PENDING_REVIEW`/`APPROVED` **ngay lúc tạo** — unit test
      khẳng định `metadata.autoApprove` truyền đúng theo `topic.autoApprove`
- [ ] ⚠️ **CHƯA bấm tay** — bài APPROVED được auto-post đăng thật lên Page *(xác minh bằng
      đọc code: picker dùng raw SQL không có điều kiện `source_type` — plan 27 đã grep xác
      nhận, không đổi gì ở plan 29)*
- [x] Double-fire: unit test gọi `discoverTopic` 2 lần liên tiếp cùng ngày ⇒ `claim` thứ 2
      trả null ⇒ **1** lượt tạo video, **0** lần gọi API thừa
- [x] Chống tải trùng: unit test — `externalId` đã biết ⇒ loại trước khi tải; **đã đo
      thật** qua `yt-search` (không tải trùng vì port `search` chỉ tìm, chưa tải)
- [ ] ⚠️ **CHƯA đo** — `REUP_TMP_DIR` rỗng sau khi mọi video IMPORTED *(code có dọn ở
      `ReupMediaUploadHook`/`ReupDownloadService.removeTempFile`, chưa quan sát bằng `ls`)*
- [x] Upload tay vẫn chạy y như trước — **29 test `media-upload-jobs.service.spec.ts`**,
      gồm 4 test riêng cho hook (không đăng ký ⇒ hành vi cũ nguyên vẹn)
- [x] `erd.md` khớp `schema.prisma` — không đổi gì thêm (mọi cột đã gộp sẵn ở migration
      plan 27, xem I6)

**Nghiệm thu độc lập — QĐ-6**
- [x] **Đã đo thật:** app boot đủ mọi module (`ReupModule`, `ReupDownloaderModule`,
      `ReupMediaHookModule`), 0 lỗi, 17 route `/api/reup/*` đăng ký đủ — **không** kiểm tra
      downloader lúc khởi động (grep log boot: 0 dòng nhắc tới downloader)
- [ ] ⚠️ **CHƯA đo** — đổi tên thư mục `ai-video-downloader` giữa lúc chạy ⇒
      `SKIPPED/DOWNLOADER_UNAVAILABLE` *(logic đã unit-test qua `DownloaderUnavailableError`
      → `ReupSkipReason.DOWNLOADER_UNAVAILABLE`, chưa thao tác tay)*
- [x] Log downloader vắng mặt = **1 dòng WARN**, không stack trace — đọc code xác nhận
      (`this.logger.warn` đúng 1 lần trong `runDiscovery`, không có `logger.error`)

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Sửa worker `media-upload` làm hỏng upload tay đang chạy tốt | Nhánh `reupVideoId = null` giữ nguyên; test hồi quy là **điều kiện Done**, không phải tuỳ chọn |
| R2 | Video reup lọt vào màn Quản lý Ảnh/Video do set `sourceType` sau | Set **ngay lúc tạo** `content_assets`, không UPDATE sau (§3.3) |
| R3 | Tải song song nhiều ⇒ đầy đĩa/nghẽn mạng | `concurrency = 2`, có `--max-filesize` ở yt-dlp, dọn file ngay sau upload |
| R4 | Video hỏng/bị gỡ giữa chừng ⇒ job retry vô tận | BullMQ `attempts: 3` + backoff; hết lượt ⇒ `FAILED` hiện lên UI, không tự thử lại |
| R5 | `autoApprove = true` + nguồn rác ⇒ page đăng clip lỗi | Mặc định `false` (QĐ-5); tooltip cảnh báo rõ; nghiệm thu bắt buộc thử `false` trước |
| R6 | Cron 02:00 chạy khi máy dev tắt ⇒ tưởng hỏng | Có nút **Quét ngay**; `/reup/runs` cho thấy chưa từng chạy, không im lặng |
| R8 | Downloader vắng mặt làm cron reup ném lỗi lên trên ⇒ ảnh hưởng scheduler chung / crash worker (vi phạm QĐ-6) | Bắt `DownloaderUnavailableError` **trong** module reup, đóng sổ `SKIPPED`; test khẳng định cron auto-post vẫn chạy đủ chu kỳ |
| R9 | Log `DOWNLOADER_UNAVAILABLE` spam mỗi lượt cron ⇒ chôn log thật | 1 dòng **WARN**/lượt, không stack trace; trạng thái hiện ở `/reup/runs` và banner, không dựa vào log để biết |
| R7 | Quét tay bấm nhiều ⇒ cháy quota 10.000 giữa ngày | Cộng dồn `quota_used`, chặn **trước khi** gọi API, hiện quota còn lại trên UI |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-16
- **File chính:**
  - BE: `src/modules/reup/{reup-filter,reup-discovery.service,reup-discovery.scheduler,
    reup-download.service,reup-download.processor,reup-media.hook,reup-videos.{service,
    controller},reup-video.mapper,reup-runs.repository,reup-videos.repository,
    reup.constants}.ts`, `dto/{query-reup-videos,query-reup-runs}.dto.ts`
  - Móc nối media-upload (thay đổi **duy nhất** cho phép ở module đó, README §4):
    `media-upload-completion.hook.ts` (mới), `media-upload-jobs.{repository,service,
    module}.ts` (+field `reupVideoId`, +hook `@Optional`), `media-upload.constants.ts`
    (+`sourceType`/`autoApprove` trong metadata)
  - `content-assets.service.ts`: tham số thứ 3 `internal` cho đường server-only
  - `app.module.ts`: đăng ký `ReupMediaHookModule` (`@Global`)
- **Khác thiết kế ban đầu:**
  1. Nối module theo hook `@Optional()` + `@Global()` module riêng
     (`ReupMediaHookModule`) thay vì callback — cách duy nhất giữ đúng chiều phụ thuộc
     một hướng (`reup` → `media-upload-jobs`) mà NestJS DI cho phép.
  2. `ContentAssetsService.create()` thêm tham số thứ 3 `internal` (chỉ code server gọi
     được, controller không có) — cần vì luật RBAC áp cho *actor*, còn bài reup phải là
     REUP bất kể actor là ai (không suy từ quyền người tạo topic).
  3. Trần 20 chủ đề đang bật đã làm ở plan 27 (dời sớm hơn kế hoạch).
  4. `searchAllKeywords` gộp kết quả nhiều keyword, khử trùng theo `externalId` trước khi
     đưa vào bộ lọc — plan không nói rõ 1 chủ đề nhiều keyword gộp thế nào.
  5. `discoverNow` (nút "Quét ngay" trên từng dòng chủ đề) đã làm luôn ở plan 29 theo yêu
     cầu bổ sung giữa chừng — không tách plan riêng vì đã nằm trong thiết kế gốc §3.4/§3.5.
- **Test:** BE **1074 xanh (+74)** — 22 test `reup-filter` (bộ lọc thuần), 21 test
  `reup-discovery.service` (double-fire, 4 cửa chặn, 2 lỗi domain, luồng thành công), 19
  test `reup-download.service`, 8 test `reup-media.hook`, 4 test hồi quy upload tay trong
  `media-upload-jobs.service.spec.ts`. FE 83 test cũ (không đổi — component không thuộc
  rule 02). Lint + build xanh cả 2 phía.
- **Đo thật (không phải chỉ unit test):**
  - Cầu nối Python: `yt-search "mẹo nấu ăn"` qua đúng đường code trả về **5 video YouTube
    thật** (view 733K–3.2M, duration đúng, JSON đúng hợp đồng)
  - App boot: 0 lỗi, `ReupModule`/`ReupDownloaderModule`/`ReupMediaHookModule` nạp đủ, 17
    route `/api/reup/*` đăng ký đủ, **0 dòng log nào kiểm downloader lúc khởi động** (QĐ-6)
- **Còn nợ:**
  1. **Chưa chạy trọn đường end-to-end trên UI thật** — chặn bởi `REUP_PYTHON_BIN`/
     `REUP_PROJECT_DIR` chưa có trong `.env` (việc của user, `ISSUES-TO-REVIEW.md` V1)
  2. Chưa quan sát `REUP_TMP_DIR` rỗng sau khi video IMPORTED bằng mắt (`ls` thật)
  3. Chưa đợi cron 02:00 chạy thật (đã đo `discoverNow` gọi logic giống hệt qua unit test,
     nhưng chưa qua đường `@Cron` decorator thật)
  4. Chưa test tay "đổi tên thư mục downloader giữa lúc chạy ⇒ SKIPPED" trên máy thật
