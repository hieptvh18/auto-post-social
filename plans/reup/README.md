# Reup Pipeline — bản đồ bộ plan

**Milestone:** M12 · **Chốt thiết kế:** 2026-08-15
**Trạng thái tổng:** 🟡 đang chạy — 26·27·28·29·30 ✅ code xong (nhiều mục chưa bấm tay
trên hạ tầng thật), 31·32·33 ⬜ chưa làm

Nối project `ai-video-downloader` (Python) vào backend auto-post (NestJS): hằng ngày
cron tự tìm video trending theo **chủ đề** người dùng khai báo, tải về, đẩy lên Drive,
tạo `content_assets` loại `REUP` để auto-post engine hiện tại đăng — và tự dọn file
sau khi đăng để không phình dung lượng.

---

## 1. Vì sao tách 5 plan

Một plan gộp sẽ có 4 vùng rủi ro rất khác nhau (role model · process Python · queue ·
cron dọn dẹp). Gộp lại thì hỏng một chỗ là kẹt cả khối, và không có mốc nào giao được
giữa chừng. Tách theo **thứ tự phụ thuộc thật**, mỗi plan xong là chạy được một thứ
quan sát được:

| # | Plan | Giao được gì sau khi xong | Phụ thuộc |
|---|---|---|---|
| 26 | [26-super-admin-role.md](./26-super-admin-role.md) | Có role `SUPER_ADMIN`, đăng nhập thấy đúng menu | — |
| 27 | [27-reup-schema-topics.md](./27-reup-schema-topics.md) | CRUD chủ đề reup qua API + màn `/reup` | 26 |
| 28 | [28-downloader-bridge.md](./28-downloader-bridge.md) | Backend gọi được Python, tải 1 video YouTube về đĩa | 27 |
| 29 | [29-reup-cron-pipeline.md](./29-reup-cron-pipeline.md) | Cron tự tìm + tải + lên Drive + tạo `content_assets` | 28 |
| 30 | [30-reup-cleanup.md](./30-reup-cleanup.md) ✅ | Tự xoá file đã đăng, giữ record | 29 |
| 31 | [31-audit-log-reup.md](./31-audit-log-reup.md) | Màn Audit Logs có nhóm log reup, chỉ SUPER_ADMIN thấy | 30 |
| 32 | [32-reup-cron-config.md](./32-reup-cron-config.md) | Đổi giờ chạy cron từ UI, không cần deploy lại | 29 (nên làm sau 30) |
| 33 | [33-unified-queue-monitor.md](./33-unified-queue-monitor.md) | `/queue` và `/failed` thấy đủ cả 4 queue (publish/media-upload/drive-import/reup) | 29 |

**Plan 32 mở thêm 2026-08-15 theo yêu cầu user** (không nằm trong bộ 5 plan gốc): giờ cron
đang hardcode `@Cron('0 2 * * *')`, muốn đổi phải sửa code + deploy. Làm **sau** khi 29-31
nghiệm thu xong — nó thay cách đăng ký cron của cả 2 scheduler nên cần chúng chạy ổn trước.

**Plan 33 mở thêm 2026-08-16** — user phát hiện Queue Monitor/Failed Jobs chỉ đọc queue
`publish-facebook`, không thấy `media-upload`/`media-drive-import`/`reup-download`. Đây là
nợ có sẵn từ plan 23-24, plan 29 chỉ làm nó lộ rõ hơn. Không phụ thuộc plan 30/31/32, có
thể làm song song.

Thứ tự 26 → 31 là **bắt buộc**. Không mở plan sau khi plan trước chưa nghiệm thu
(rule 00 §"Một module = một lần giao").

Plan 31 đứng cuối là cố ý: nó ghi log cho **mọi** sự kiện sinh ra ở plan 29-30, nên
phải có đủ các sự kiện đó rồi mới ghi được. Làm sớm hơn sẽ phải quay lại sửa nhiều lần.

---

## 2. Quyết định kiến trúc đã chốt (không mở lại trong lúc code)

### QĐ-1 — Python chạy như **process con**, không phải HTTP service

Backend gọi `spawn(.venv/bin/python -m backend <cmd> --json)`, đọc JSON ở stdout.

*Lý do:* nhu cầu thật là **2-3 video/ngày**. Dựng thêm một HTTP service Python kèm
deploy/healthcheck/retry là chi phí không tương xứng. Adapter nằm sau interface
`ReupDownloaderPort` ⇒ khi nào cần đổi sang HTTP thì sửa đúng 1 file.

**Nói thẳng giới hạn của cách này:** spawn process **tách được code, không tách được
deploy**. Hai project vẫn phải nằm cùng một máy và chung filesystem (backend đọc file
`.mp4` Python vừa tải). Đây là đánh đổi có ý thức, không phải sơ suất — xem QĐ-6.

### QĐ-6 — `ai-video-downloader` là **phụ thuộc tuỳ chọn**, không phải bắt buộc

Chốt với user 2026-08-15. Backend phải chạy **bình thường** khi không có downloader:
không cài Python, xoá thư mục, sai đường dẫn — tất cả đều **không** được làm hỏng thứ gì
ngoài chính tính năng reup.

Ba luật bắt buộc, áp cho mọi plan trong bộ này:

1. **Không kiểm tra downloader lúc khởi động.** `REUP_PYTHON_BIN` / `REUP_PROJECT_DIR`
   là biến **optional**. Thiếu ⇒ app vẫn boot, chỉ tính năng reup ngưng. Đây là điểm
   **khác** với `TOKEN_ENCRYPTION_KEY`/`DATABASE_URL` (thiếu là crash đúng) — reup không
   phải hạ tầng lõi.
2. **Hỏng thì degrade có tiếng, không im lặng và không crash.** Cron chạm tới lúc nào
   thì phát hiện lúc đó: `reup_runs.status = SKIPPED`,
   `skip_reason = DOWNLOADER_UNAVAILABLE`, log **1 dòng WARN** (không phải stack trace
   mỗi lượt), UI `/reup` hiện banner. Không ném lỗi ra ngoài module reup.
3. **Không module nào ngoài `modules/reup` được import `ReupDownloaderPort`.**
   Kho nội dung, auto-post, publish, dashboard, audit không biết downloader tồn tại.

**Kiểm chứng bằng test, không bằng niềm tin:** mỗi plan có case "gỡ downloader ⇒ phần
còn lại vẫn xanh" ở mục nghiệm thu. Độc lập mà không có test thì chỉ là đang may.

*Vì sao không làm HTTP service ngay:* nó tách được deploy thật, nhưng phải giải quyết
**việc chuyển file** — thứ khó nhất trong bài toán này (upload ngược về BE, hoặc Python
tự cầm credential Drive ⇒ bỏ QĐ-3). Chưa có nhu cầu nào đòi trả giá đó. Đường nâng cấp
ghi sẵn ở plan 28 §3.6 để sau này đổi chỉ sửa 1 adapter.

### QĐ-2 — YouTube trước, Douyin/TikTok sau

Nguồn cấu hình động ở web có 3 option `YOUTUBE` (mặc định) · `DOUYIN` · `TIKTOK`, nhưng
**giai đoạn này chỉ implement YOUTUBE**. Hai platform kia lưu được vào DB nhưng adapter
ném `NotImplementedError` ⇒ run `SKIPPED/PLATFORM_NOT_SUPPORTED`.

*Lý do:* `crawler.py` hiện chỉ crawl Douyin **theo feed/profile**, không search theo
keyword. YouTube có Data API v3 search chính thức + `yt-dlp` tải được ⇒ là đường duy
nhất hôm nay làm đúng "tìm theo chủ đề" mà không phải viết crawler mới dễ vỡ.

### QĐ-3 — Tái dùng `MediaUploadJob`, **không** viết đường lên Drive thứ hai

Backend đã có `MediaUploadJob` với `source = LOCAL_FILE | DRIVE_LINK`, worker đẩy file
đĩa → Drive → tạo `content_assets`. Reup chỉ thêm `source = REUP`.

*Lý do:* viết ống thứ hai lên Drive nghĩa là nhân đôi chỗ xử lý lỗi/retry/giới hạn
dung lượng. Đường ống đã chạy thật rồi thì dùng lại.

### QĐ-4 — `content_assets` thêm **1 cột**, metadata nguồn ở **bảng riêng**

`content_assets.source_type` (`MANUAL | REUP`) chỉ để tách 2 menu. Toàn bộ metadata
nguồn (link gốc, tác giả, externalId, view lúc phát hiện) nằm ở `reup_videos`.

*Lý do:* nhồi metadata nguồn vào `content_assets` làm phình bảng vì lý do không thuộc
về nó. Và `reup_videos.@@unique([platform, externalId])` mới là chỗ **chống tải trùng** —
không có nó thì hôm sau cron tải lại đúng video hôm nay.

### QĐ-5 — Mặc định `PENDING_REVIEW`, có cờ `autoApprove` để bật auto hoàn toàn

Video reup vào kho ở trạng thái chờ duyệt. Bật `reup_topics.autoApprove = true` thì vào
thẳng `APPROVED` và scheduler nhặt đăng luôn.

*Lý do:* nguồn trending có clip lỗi/1 giây/sai chủ đề lọt vào. Mặc định an toàn, nhưng
người vận hành tự quyết được — không ép.

---

## 3. Sơ đồ luồng tổng

```text
[Plan 27]  reup_topics (chủ đề + keyword + bộ lọc + dailyQuota 2-3 + autoApprove)
                │
[Plan 29]  Cron A "reup-discovery"  @Cron(mỗi ngày 02:00, tz Asia/Ho_Chi_Minh)
                │  claim qua reup_runs UNIQUE(topic_id, run_date)   ← chống double-fire
                ▼
           YoutubeSearchAdapter (Data API v3, search.list)
                │  lọc: đã có trong reup_videos? · minView · maxAgeDays · duration
                │  chọn top N = topic.dailyQuota
                ▼
           reup_videos (status = PENDING)  ──► BullMQ queue "reup-download"
                                                      │
[Plan 28]                                             ▼
                                          ReupDownloadProcessor
                                          spawn python -m backend ytdl <url> --json
                                                      │ file .mp4 trên đĩa server
                                                      ▼
[Plan 29]                                 MediaUploadJob (source = REUP)   ← ống có sẵn
                                                      ▼
                                          Drive upload → content_assets
                                          (source_type = REUP,
                                           status = PENDING_REVIEW | APPROVED)
                                                      ▼
                                    ┌─────────────────────────────────┐
                                    │  auto-post engine hiện tại      │
                                    │  KHÔNG SỬA GÌ                   │
                                    └─────────────────────────────────┘
                                                      ▼
[Plan 30]  Cron C "reup-cleanup" @Cron(03:00) — PUBLISHED > N ngày
           xoá file Drive · giữ nguyên record · set resource_deleted_at
```

---

## 4. Ranh giới cứng — vi phạm là sai plan

1. **Không sửa auto-post engine** (`src/modules/auto-post/**`). Reup là *producer* đổ
   bài vào kho; phần đăng đã chạy rồi, không đụng. Ngoại lệ **duy nhất** được phép:
   thêm điều kiện `resource_deleted_at IS NULL` vào picker (plan 30) — vì không thêm
   thì Bot nhặt phải bài đã xoá file.
2. **Không xoá file của bài `MANUAL`.** Cleanup chỉ chạm `source_type = REUP`.
3. **Không viết đường upload Drive thứ hai** (QĐ-3).
4. **Không implement Douyin/TikTok** trong 5 plan này (QĐ-2). Muốn làm ⇒ mở plan 31.
5. **Không làm transcribe/lồng tiếng/dịch** — `transcribe.py`, `voices/` bên project
   Python **không** nằm trong phạm vi. Reup = tải nguyên bản rồi đăng.

## 5. Cạm bẫy đã phát hiện khi khảo sát code (đọc trước khi code)

| # | Cạm bẫy | Nằm ở plan |
|---|---|---|
| C1 | `frontend/src/utils/permissions.ts` → `canAccessRoute()` dùng **allowlist role cứng**, không dùng permission. Thêm `SUPER_ADMIN` mà quên map này ⇒ super-admin **mất sạch menu** | 26 |
| C2 | `ROLE_PERMISSIONS[ADMIN] = PERMISSIONS` (toàn bộ). Thêm permission mới vào mảng `PERMISSIONS` ⇒ ADMIN **tự động có** ⇒ phải liệt kê tay cho ADMIN thay vì dùng hằng `PERMISSIONS` | 26 |
| C3 | `ROLE_LABELS` / `ROLE_COLORS` ở `frontend/src/utils/constants.ts` là `Record<UserRole, …>` ⇒ thiếu key mới là **lỗi TypeScript**, không phải lỗi runtime — build sẽ bắt được | 26 |
| C4 | `crawler.py`/`cli.py` in bảng `rich` ra stdout ⇒ NestJS parse JSON sẽ **dính rác**. Bắt buộc `--json` in JSON thuần, log người đọc đẩy sang **stderr** | 28 |
| C5 | `downloader.py` bỏ qua file đã tồn tại > 10KB. Đường dẫn out do NestJS chỉ định phải **duy nhất theo job** để không ăn nhầm file cũ | 28 |
| C6 | Xoá file Drive khi còn `publish_job` `SCHEDULED/QUEUED/PUBLISHING` ⇒ job đăng file không tồn tại | 30 |
| C7 | Ẩn dropdown "Loại" ở FE là **chưa đủ** — role thường gọi `GET /content-assets?sourceType=REUP` vẫn đọc được. Phải **ép cứng** `MANUAL` ở service khi thiếu `reup:view` | 27 |
| C8 | Đặt lọc `sourceType` ở repository dùng chung hoặc Prisma middleware ⇒ picker auto-post **không nhặt được bài reup** và Dashboard đếm thiếu — hỏng âm thầm, rất khó lần | 27 |
| C9 | `AuditRepository.distinctActions()` đổ dropdown lọc **từ dữ liệu thật**. Quên lọc ⇒ ADMIN thấy `REUP_DISCOVER_CRON`… trong dropdown dù không xem được record — **tên action tự nó đã tiết lộ tính năng** | 31 |
| C10 | Rule 04 nói env thiếu ⇒ crash lúc boot. Biến `REUP_*` là **ngoại lệ có chủ đích** (QĐ-6): validate lúc boot ⇒ máy chưa cài downloader thì **cả backend không khởi động được** | 28 |
