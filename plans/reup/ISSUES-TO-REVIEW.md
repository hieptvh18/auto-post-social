# Reup 26–31 — Các quyết định tự chọn cần user review

> File này gom **mọi chỗ tôi phải tự quyết** trong lúc code bộ plan 26→31, theo yêu cầu
> user 2026-08-15 ("gặp issue cần confirm hãy tự chọn phương án an toàn → tổng hợp lại").
> Mỗi mục ghi: bối cảnh · các lựa chọn · **tôi chọn gì và vì sao** · hệ quả nếu user muốn đổi.

**Bắt đầu:** 2026-08-15

---

## Đã confirm trực tiếp với user (không phải tự quyết)

| # | Vấn đề | User chốt |
|---|--------|-----------|
| U1 | Chạy migration + seed trên DB của device này | **Được** — additive only; drift/reset ⇒ dừng và báo |
| U2 | Phạm vi giao | Làm hết 26→31 rồi báo cáo cuối |
| U3 | Sửa `docs/05-rbac.md` (rule 00 §1 cấm tự sửa) | **Được phép** cập nhật §2 và §8 |
| U4 | API key YouTube | User tự đặt trong `.env` tên **`API_GG_CLOUD_YOUTOBE_V3`** ⇒ tôi thêm nhánh fallback env (xem I14) |

---

## ⚠️ VIỆC CẦN BẠN LÀM TAY

### V1 — Thêm 2 dòng đường dẫn vào `backend/.env`

Tôi **không ghi được** vào `.env` (bị chặn quyền trong session này). Hai dòng này là
**đường dẫn thuần, không phải secret**:

```bash
REUP_PYTHON_BIN=/Users/hieptvh18/code/tool-auto-fb/ai-video-downloader/backend/.venv/bin/python3
REUP_PROJECT_DIR=/Users/hieptvh18/code/tool-auto-fb/ai-video-downloader
```

Thiếu 2 dòng này thì backend vẫn chạy bình thường, chỉ riêng tính năng reup báo
`DOWNLOADER_UNAVAILABLE` (đúng thiết kế QĐ-6). **Cầu nối Python tự nó đã chạy được** —
đã đo thật: `yt-search "mẹo nấu ăn"` trả về 5 video thật kèm view/duration đúng.

---

## Tự quyết trong lúc code

### I1 — Dùng `migrate deploy` thay vì `migrate dev` để áp migration · plan 26

**Bối cảnh:** rule 05 ghi quy trình `npx prisma migrate dev`. Nhưng `migrate dev` khi
phát hiện drift sẽ **đề nghị reset (xoá sạch) database** — trên máy user đang có dữ liệu
thật thì đó là rủi ro không cần thiết.

**Chọn:** tôi tự viết file `migration.sql` bằng tay rồi chạy `npx prisma migrate deploy`
(+ `prisma generate` riêng). `deploy` **không bao giờ** đề nghị reset. Đã chạy
`migrate status` trước để xác nhận không có drift.

**Hệ quả nếu muốn đổi:** không có — kết quả trên DB giống hệt, chỉ khác đường đi.

---

### I2 — `countActiveAdmins()` nay đếm **cả** SUPER_ADMIN · plan 26

**Bối cảnh:** hàm này chặn "hạ/khoá ADMIN cuối cùng". Sau khi có SUPER_ADMIN, nếu vẫn
chỉ đếm `role = 'ADMIN'` thì: hệ thống còn 1 SUPER_ADMIN đang hoạt động (quyền cao hơn,
làm được mọi việc của ADMIN) mà vẫn **chặn** hạ ADMIN cuối cùng ⇒ chặn nhầm.

**Chọn:** `countActiveAdmins()` đếm `role IN ('ADMIN','SUPER_ADMIN')`, và thêm hàm riêng
`countActiveSuperAdmins()` cho luật 422 của §3.4. Có test khẳng định cả hai chiều.

**Hệ quả nếu muốn đổi:** nếu bạn muốn hệ thống **luôn** còn ≥1 ADMIN thuần (không tính
SUPER_ADMIN), nói tôi đảo lại 1 dòng ở `users.repository.ts`.

---

### I3 — ADMIN không được **sửa/khoá** một SUPER_ADMIN sẵn có · plan 26

**Bối cảnh:** plan §3.4 chỉ nói rõ "chỉ SUPER_ADMIN mới được **tạo/sửa user có role**
SUPER_ADMIN". Không nói gì về việc ADMIN *vô hiệu hoá* (soft delete) một SUPER_ADMIN.

**Chọn:** chặn luôn (403) ở cả `update` và `remove`, kiểm **cả role đích lẫn role hiện
tại**. Nếu không chặn thì luật "ADMIN không tạo được SUPER_ADMIN" thành vô nghĩa —
ADMIN chỉ cần khoá hết SUPER_ADMIN là xong.

**Hệ quả nếu muốn đổi:** nới ra thì bỏ 2 dòng `assertMaySetSuperAdmin(current.role, actor)`.

---

### I4 — `UserManagementPage` bản **mock** không sửa theo · plan 26

**Bối cảnh:** file có 2 component (bản API thật + bản `MockDataContext` giữ theo ADR-005).
Bản mock có logic "không xoá admin cuối cùng" so `role === 'ADMIN'` cứng.

**Chọn:** chỉ sửa bản API thật (select role lọc theo `roleOptionsFor`). Bản mock để nguyên
— nó không phải ranh giới bảo mật, chỉ là dữ liệu giả để xem giao diện, và plan 26 không
yêu cầu.

---

### I5 — ✅ **ĐÃ XONG** — seed SUPER_ADMIN · plan 26

**Ban đầu:** seed dừng có thông báo vì `.env` chưa có `SEED_SUPER_ADMIN_*` (đúng thiết kế
§3.5 — thiếu env thì **dừng**, không tạo user mật khẩu mặc định kiểu `admin123`).

**Đã giải quyết 2026-08-15:** user tự thêm 2 biến vào `backend/.env` rồi tôi chạy seed.
Kết quả xác minh trực tiếp trên bảng `users`:

| email | role | isActive |
|---|---|---|
| `superadmin@example.com` | **SUPER_ADMIN** | true |
| `admin@company.local` | ADMIN *(giữ nguyên, không bị nâng cấp)* | true |

Chạy seed lần 2 ⇒ *"SUPER_ADMIN đã tồn tại — bỏ qua"*, không tạo dòng trùng, không ghi đè
mật khẩu. Không lần nào in mật khẩu ra terminal.

**Lưu ý cho bạn:** email đang là `superadmin@example.com` (giá trị mẫu trong
`.env.example`). Đổi sang email thật thì seed sẽ tạo **user thứ hai** chứ không đổi tên
user cũ — sửa trực tiếp ở màn `/users` sẽ đúng hơn.

---

### I6 — Gộp 3 thay đổi schema của plan 29 vào migration của plan 27

**Bối cảnh:** plan 29 §4 yêu cầu migration riêng cho `reup_runs.quota_used`,
`media_upload_jobs.reup_video_id`, và `MediaUploadSource += REUP`.

**Chọn:** gộp cả 3 vào migration `20260815010000_reup_topics_videos_runs` của plan 27.
Lý do: `ALTER TYPE ... ADD VALUE` trên `MediaUploadSource` là thao tác dễ vướng nhất
(transaction, phiên bản Postgres) — làm 1 lần an toàn hơn 2 lần. Cả 3 đều là cột
nullable/có default nên nằm sẵn trong DB mà chưa ai đọc thì hoàn toàn vô hại.

**Hệ quả:** plan 29 không cần migration nào nữa. `erd.md` đã ghi rõ điều này trong
Lịch sử thay đổi.

---

### I7 — Luật "bài REUP ⇒ 404" đặt ở `getOrFail()` thay vì sửa 3 method

**Bối cảnh:** plan 27 §4 liệt kê riêng `findOne` / `update` / `delete`.

**Chọn:** đặt luật ở `ContentAssetsService.getOrFail()` — cửa **duy nhất** để lấy 1 bài
theo id. Nhờ vậy phủ luôn cả `bulkDelete`/`bulkSetActive` (plan không nhắc tới nhưng
cũng đọc bài theo id ⇒ cũng là đường rò rỉ). Sửa 3 chỗ riêng lẻ thì 2 đường bulk vẫn hở.

---

### I8 — Form "Thêm bài" **chưa** có select "Loại" (plan 27 §4 FE)

**Bối cảnh:** plan yêu cầu form thêm/sửa bài có select Loại cho SUPER_ADMIN.

**Vấn đề:** luồng "Thêm bài" hiện đi qua **hàng đợi upload phía trình duyệt**
(`useLocalUploadQueue` → `media_upload_jobs` → worker tạo `content_assets`), không gọi
thẳng `POST /content-assets`. Muốn có select Loại thật sự chạy được thì phải luồn
`sourceType` qua: form → uploadQueue → `POST /media/upload` → `metadata` jsonb → worker.
Đó là 4 file thuộc module `media-upload-jobs` mà plan 27 §2 ghi rõ **"Không đụng
`MediaUploadJob`"**.

**Chọn phương án an toàn:** **không** thêm select vào form. Backend **đã** hỗ trợ đầy đủ
(`POST /content-assets` nhận `sourceType`, có test SUPER_ADMIN ghi được REUP / role khác
bị ép MANUAL) nên hàng rào RBAC không hở chỗ nào; chỉ là UI chưa có nút bấm.

**Vì sao chấp nhận được:** bài REUP thật sẽ do **cron plan 29 tạo ra ở phía server**,
không ai tạo tay. Select này chỉ hữu dụng để test tay.

**Nếu bạn muốn có:** nói một tiếng, tôi luồn `sourceType` qua metadata của
`media_upload_jobs` (ước lượng ~4 file, có test hồi quy cho nhánh upload tay).

---

### I9 — Cột "Loại" làm thành **Tag trong cột Trạng thái**, không phải cột riêng

**Bối cảnh:** plan 27 §4 ghi "cột **Loại** (Tag) khi đang xem Tất cả".

**Chọn:** hiện Tag ngay trong cột "Trạng thái" sẵn có, chỉ khi bộ lọc = `Tất cả`.
Lý do: bảng `/content` đã 10 cột và `scroll={{ x: 1500 }}`; thêm cột thứ 11 chỉ để hiện
1 chữ khi lọc "Tất cả" làm bảng tràn thêm trên màn hẹp (vừa mới sửa responsive session
trước). Khi đang lọc đúng 1 loại thì tag lặp y hệt trên mọi dòng nên cố ý ẩn.

**Đổi được dễ:** nếu bạn muốn cột riêng, đó là ~10 dòng trong `columns`.

---

### I10 — API key YouTube đặt ở `/reup/settings/youtube`, **không** ở `/settings` · plan 28

**Bối cảnh:** plan 28 §3.3 nói key theo ADR-014 (sửa từ UI, giống `facebook_app`/`drive`),
nhưng **không nói** đặt endpoint ở controller nào.

**Vấn đề:** toàn bộ `SettingsController` gác `settings:manage` — quyền mà **ADMIN có**.
Thêm tab "YouTube API" vào màn Cài đặt chung là để lộ sự tồn tại của tính năng reup cho
ADMIN, đúng thứ plan 31 (cạm bẫy C9) bỏ công chặn ở màn audit.

**Chọn:** endpoint nằm ở `ReupDownloaderController` (`GET`/`PUT /reup/settings/youtube`),
gác `reup:view`/`reup:manage`. Logic vẫn ở `SettingsService` và vẫn lưu vào
`app_settings['youtube_api']` đúng ADR-014 — chỉ khác **cửa vào**.

**Hệ quả:** UI cấu hình key nằm ở màn Reup Setting, không phải màn Cài đặt chung.

---

### I11 — Ưu tiên tải H.264 thay vì `bestvideo` · plan 28

**Bối cảnh:** plan chỉ ghi "format ưu tiên mp4 ≤1080p".

**Đo thật 2026-08-15:** với `bestvideo[height<=1080][ext=mp4]`, yt-dlp chọn **format 399 =
AV1**. Facebook xử lý AV1 rất kém (transcode lâu, có lúc từ chối).

**Chọn:** thêm `[vcodec^=avc1]` vào đầu chuỗi format, có 4 nấc fallback để video hiếm vẫn
tải được. Đo lại: chọn format **299 (H.264 1080p60)**, tải thật 288MB thành công.

---

### I12 — Thêm `contract-version` làm lệnh Python thứ 3 · plan 28

**Bối cảnh:** plan §3.3b nói `checkAvailability()` chạy `python -m backend --version --json`.

**Vấn đề:** `--version` là **flag của `click`** ở nhóm lệnh gốc, in ra text tự do chứ không
theo hợp đồng JSON, và không nói được `contractVersion`.

**Chọn:** thêm lệnh con `contract-version --json` trả đúng khuôn
`{contractVersion, ok, version}`. Nhờ vậy `checkAvailability()` **cũng kiểm luôn hợp đồng**
— phát hiện lệch version ngay ở banner, không phải đợi tới lượt quét đầu tiên.

---

### I13 — `parseJsonLine` quét từ dòng CUỐI lên, chịu được rác · plan 28

**Bối cảnh:** hợp đồng nói stdout chỉ có đúng 1 dòng JSON, và Python đã tuân thủ (đã đo:
stdout đúng 1 dòng, toàn bộ log yt-dlp nằm ở stderr).

**Chọn:** backend vẫn **không tin tuyệt đối** — quét ngược từ dòng cuối, bỏ qua dòng không
parse được. Đây là biên với process ngoài; một `print()` lỡ tay bên Python sẽ làm hỏng
toàn bộ tính năng, mà chi phí phòng thủ chỉ là ~10 dòng.

Không tìm thấy dòng JSON nào ⇒ `DownloaderParseError` **kèm nguyên stdout** để debug.

---

### I14 — API key YouTube: thêm nhánh **fallback `.env`** · plan 28

**Bối cảnh:** thiết kế ban đầu (plan 28 §3.3, ADR-014) để key **chỉ** ở
`app_settings['youtube_api']`, sửa từ UI. Nhưng user đã đặt sẵn key trong `backend/.env`
với tên `API_GG_CLOUD_YOUTOBE_V3`.

**Chọn:** thêm nhánh fallback **đúng khuôn Drive/Facebook đang dùng** — thứ tự ưu tiên:

```text
app_settings['youtube_api'].apiKeyEnc  (nhập ở UI, đã mã hoá)   ← THẮNG
    ↓ chưa có / đã xoá
process.env.API_GG_CLOUD_YOUTOBE_V3                             ← fallback
    ↓ cũng không có
null ⇒ YoutubeNotConfiguredError ⇒ SKIPPED/NOT_CONFIGURED
```

Response `GET /reup/settings/youtube` có thêm cờ `usingEnvFallback` (giống
`DriveSettingsResponse`/`FacebookAppSettingsResponse`) để UI nói rõ "đang chạy bằng key
trong .env".

**Hai điểm cần bạn biết:**

1. **Tên biến có lỗi chính tả**: `YOUTOBE` (đúng phải là `YOUTUBE`). Tôi **giữ nguyên**
   tên bạn đã đặt để không làm hỏng cấu hình đang chạy. Muốn đổi cho sạch thì sửa 2 chỗ:
   `env.validation.ts` + `app-config.service.ts`, rồi đổi tên trong `.env`.
2. Key trong `.env` **không được mã hoá** (khác key nhập qua UI — cái đó AES-256-GCM).
   Chấp nhận được vì `.env` đã gitignore và chứa sẵn `TOKEN_ENCRYPTION_KEY`/`DATABASE_URL`,
   nhưng nếu muốn chặt chẽ thì nhập lại key ở màn Reup Setting để nó vào DB đã mã hoá.

**Đã đo thật:** key hợp lệ — gọi `yt-search --keyword "mẹo nấu ăn"` qua đúng cầu nối trả
về **5 video thật** (view 733K–3.2M, duration 38–131s, đúng hình dạng hợp đồng JSON).

---

### I15 — Nối module reup ↔ media-upload-jobs bằng hook `@Optional()` + module `@Global` · plan 29

**Bối cảnh:** plan 29 §3.3 mô tả "cách (a)" là thêm cột `reupVideoId` + worker gọi callback,
nhưng không nói **cơ chế NestJS** cụ thể.

**Chọn:** `media-upload-completion.hook.ts` khai báo interface + DI token ở module
`media-upload-jobs` (nó không import gì từ `reup`). `reup-media.hook.ts` implement
interface đó và đăng ký qua một `@Global()` module riêng (`ReupMediaHookModule`) import ở
`app.module.ts`. `MediaUploadJobsService` inject hook bằng `@Optional()` — không ai đăng
ký thì `null`, luồng upload tay chạy y hệt cũ.

**Vì sao không callback trực tiếp:** NestJS DI chỉ cho phép chiều phụ thuộc theo hướng
import module. Muốn `media-upload-jobs` gọi ngược vào `reup` mà không tự import nó, `@Global`
+ hook interface là cách duy nhất giữ đúng ranh giới cứng của README §4 ("không module nào
ngoài `modules/reup` biết reup tồn tại").

**Test:** 8 test cho hook (`reup-media.hook.spec.ts`) + 4 test hồi quy trong
`media-upload-jobs.service.spec.ts` khẳng định: không đăng ký ⇒ hành vi cũ nguyên vẹn; có
đăng ký ⇒ gọi đúng tham số; hook tự ném lỗi ⇒ bị nuốt, không làm hỏng job đã thành công.

---

### I16 — `ContentAssetsService.create()` thêm tham số thứ 3 `internal` (chỉ server gọi được) · plan 29

**Bối cảnh:** bài reup phải luôn có `sourceType = REUP` bất kể ai đứng tên tạo (`createdById`
= người khai chủ đề, không phải "Bot").

**Vấn đề:** luật RBAC hiện có (`resolveSourceTypeFilter` ở plan 27) suy `sourceType` từ
**quyền của actor**. Nếu dùng nguyên luật đó cho worker, thì hôm nào người khai chủ đề bị hạ
quyền xuống dưới `reup:view`, video reup mới sẽ **âm thầm** ghi `MANUAL` — sai mà không ai
biết.

**Chọn:** thêm tham số thứ 3 optional `internal?: { sourceType, forceApprove }` mà
**controller không có** (không expose qua HTTP) — chỉ `ReupDownloadService` (code server)
gọi được. `internal.sourceType` thắng tuyệt đối luật RBAC theo actor.

**Test:** unit test khẳng định `metadata.sourceType`/`metadata.autoApprove` được set đúng
lúc gọi `mediaJobs.create()`, và test hồi quy khẳng định upload tay (không có `internal`)
vẫn đi qua đúng nhánh RBAC cũ.

---

### I17 — Nút "Quét ngay" mỗi dòng chủ đề: làm luôn ở plan 29, không tách plan mới · 2026-08-16

**Bối cảnh:** user hỏi giữa chừng "muốn thêm nút Clone ngay + chống tải trùng — tạo plan
mới để làm sau".

**Chọn:** không tạo plan mới. Đây **chính là** endpoint `POST /reup/topics/:id/discover-now`
+ nút "Quét ngay" đã có sẵn trong thiết kế gốc plan 29 (§3.4, §3.5) — tôi đang code đúng lúc
được hỏi. Chống tải trùng cũng đã có 2 lớp: DB `UNIQUE(platform, external_id)` (không thể
trùng dù có bug ở tầng code) + `reup-filter.ts` lọc theo tập `externalId` đã biết **trước
khi** gọi API tải (không tốn công tải lại).

**Đã làm:** nút "Quét ngay" trên từng dòng ở tab Chủ đề (`ReupSettingsPage.tsx`), disable khi
platform chưa hỗ trợ hoặc chủ đề đang tắt, toast phân biệt 3 case (đã quét hôm nay / tìm
được video mới / không có video mới).

---

### I18 — 🐛 BUG THẬT: worker `media-upload` bỏ qua job REUP, treo vĩnh viễn · phát hiện 2026-08-16

**Triệu chứng:** user báo 2 video reup ở tab "Video đã kéo" kẹt trạng thái "Đang lên
Google Drive" hơn 10 phút.

**Điều tra:** tra trực tiếp DB + Redis (`docker exec tool-auto-fb-redis redis-cli`) thấy
job BullMQ **đã "completed" từ lâu** (`processedOn`/`finishedOn` có giá trị) nhưng
`reup_videos.status` vẫn `UPLOADING`, `media_upload_jobs.status` vẫn `QUEUED` với
`bullJobId: null` — nghĩa là worker **đã cầm job lên nhưng bỏ qua ngay lập tức**, không hề
chạm vào DB.

**Nguyên nhân gốc:** `MediaUploadJobsService.process()` (dòng gọi bởi `MediaUploadProcessor`
cho MỌI job trong queue `media-upload`) hardcode:
```ts
async process(input) {
  await this.runJob(input, MediaUploadSource.LOCAL_FILE, ...);   // ← chỉ nhận LOCAL_FILE
}
```
Job reup có `source = REUP` (thêm ở plan 29) nên bị `runJob()` tự bỏ qua ở dòng kiểm
`job.source !== source` — không upload, không tạo bài, **không ghi lỗi nào**. Vì
`process()` không ném exception, BullMQ coi job là thành công ⇒ **không bao giờ tự retry**.
Đây là lỗi tôi tự đưa vào lúc code plan 29 — không phải do downloader, Drive, hay mạng.

**Đã sửa:** `process()` nhận danh sách nguồn `[LOCAL_FILE, REUP]` thay vì 1 giá trị cố
định — cả hai đều dùng đúng luồng `uploadAndCreateAsset` (chỉ khác nguồn gốc file, không
khác cách xử lý). `runJob()` đổi tham số từ `source: MediaUploadSource` sang
`allowedSources: MediaUploadSource | MediaUploadSource[]`, giữ tương thích ngược với
`processImport()` (DRIVE_LINK) đang gọi bằng 1 giá trị đơn.

**Đã xử lý dữ liệu kẹt:** 2 bản ghi `reup_videos` bị treo đã UPDATE tay sang `FAILED` kèm
`errorMessage` giải thích rõ nguyên nhân — **bạn cần tự bấm "Thử lại"** ở tab "Video đã
kéo" trong `/reup` để chúng chạy lại (worker đã vá, backend `--watch` đã tự reload).

**Test:** thêm 2 case trong `media-upload-jobs.service.spec.ts` — `source=REUP` được xử
lý đúng (không còn bị bỏ qua) và `source=DRIVE_LINK` **vẫn đúng** bị bỏ qua ở worker này
(nó thuộc `DriveImportProcessor` khác). BE 1076 test xanh (+2). Đây chính là lỗ hổng mà
1074 test trước đó **không bắt được** — vì mọi test cũ của `process()` chỉ dùng
`makeJob()` mặc định `source: LOCAL_FILE`, không có case nào test qua `REUP`.

**Bài học ghi vào README nếu mở thêm queue dùng chung worker:** mọi lần thêm `source` mới
vào một bảng job dùng chung nhiều worker, phải rà lại **toàn bộ nơi so sánh `source` cứng**
(`grep -n "=== MediaUploadSource\.\|!== MediaUploadSource\."`), không chỉ chỗ tạo job.

---

### I19 — 🐛 Bug thứ 2 phát hiện khi rà cleanup theo yêu cầu user: thư mục rác + file "hết lượt" sống 24h

**Bối cảnh:** user yêu cầu rà lại "tạo mới phải cleanup phù hợp resource, không được có
file rác làm tăng dung lượng ngầm quên xoá" sau khi phát hiện bug I18.

**Phát hiện khi soát code:**

1. **Thư mục rỗng không được dọn** — `removeTempFiles()` (dùng chung cho mọi nguồn) chỉ
   `rm(tempPath, {force:true})`, xoá đúng **file** nhưng để lại **thư mục cha rỗng**.
   Với reup, mỗi video có 1 thư mục riêng `REUP_TMP_DIR/<videoId>/` (cạm bẫy C5, plan 28)
   ⇒ mỗi bài đăng thành công để lại 1 thư mục rỗng, tăng dần vĩnh viễn, không ai xoá.
2. **File đầy đủ (100-300MB) sống tới 24h khi hết lượt retry** — nhánh lỗi giữ nguyên
   file "để `Thử lại` không bắt chọn lại file", nhưng đây là giả định **sai với reup**:
   `POST /reup/videos/:id/retry` (nút Thử lại thật trên UI) không bao giờ đọc lại
   `tempPath` cũ — nó luôn tải MỚI từ YouTube vào thư mục KHÁC qua
   `ReupVideosService.retry()`. File cũ ở đây là rác chắc chắn, không có đường nào dùng
   lại, nhưng chỉ được dọn bởi cron `MEDIA_UPLOAD_JOB_RETENTION_MS` (mặc định 24h).

**Xác minh trước khi vá:** kiểm tra kỹ để không phá `LOCAL_FILE` — multer ghi PHẲNG mọi
file upload tay vào CHUNG một `MEDIA_UPLOAD_TMP_DIR` (không có thư mục con riêng từng
job). Nếu đổi `removeTempFiles()` sang "luôn xoá thư mục cha" cho mọi nguồn thì
`LOCAL_FILE` sẽ **xoá nhầm toàn bộ thư mục tạm dùng chung** — cực kỳ nguy hiểm. Đã hỏi
user 1 câu chốt trước khi sửa: *"REUP còn lượt retry — giữ hay xoá file ngay?"* → user
chọn **giữ** (đúng khuôn LOCAL_FILE, vì job REUP còn lượt là BullMQ tự retry lại chính
bước upload Drive trên cùng file, không phải tải lại từ YouTube).

**Đã vá — chỉ 2 chỗ, tách riêng theo `source`, không đụng hành vi `LOCAL_FILE`/`DRIVE_LINK`:**
1. `removeTempFiles()`: `source = REUP` ⇒ nhánh riêng `removeReupTempDirs()` xoá
   `rm(dirname(tempPath), {recursive:true, force:true})`. Nguồn khác giữ nguyên
   `rm(tempPath, {force:true})`.
2. `runJob()` nhánh lỗi: `source = REUP && isLastAttempt` ⇒ dọn NGAY (gọi
   `removeTempFiles` + set `filesRemovedAt`) thay vì đợi cron 24h. `LOCAL_FILE`/còn lượt
   của `REUP` giữ nguyên hành vi cũ (giữ file).
3. Xoá code chết: `ReupDownloadService.removeTempFile()` được viết ở plan 29 nhưng
   **chưa từng được gọi** — comment trong hook nói "file tạm đã được worker xoá" nhưng
   thực ra chưa đúng cho tới bản vá này. Xoá hàm chết, giữ đúng 1 đường dọn duy nhất
   (`removeTempFiles` phía `media-upload-jobs`) để tránh 2 nơi cùng tưởng mình chịu
   trách nhiệm dọn rồi không ai làm — đúng bài học đã rút ra ở I18.

**Test:** 6 case mới — REUP thành công xoá thư mục / LOCAL_FILE thành công vẫn chỉ xoá
file (hồi quy) / REUP hết lượt dọn ngay / REUP còn lượt giữ file / LOCAL_FILE hết lượt
vẫn giữ file (hồi quy) / restart giữa lúc job REUP dở cũng xoá đúng thư mục. BE
**1082 xanh (+6)**.

**Dữ liệu thật đã dọn:** kiểm tra `REUP_TMP_DIR` trên máy — phát hiện đúng 4 thư mục rỗng
sót lại từ trước khi vá (0 byte mỗi cái, không có video nào bị bỏ quên nguyên vẹn — may
mắn vì code cũ vẫn xoá đúng file, chỉ sót thư mục). Đã `rm -rf` dọn tay 4 thư mục đó.
