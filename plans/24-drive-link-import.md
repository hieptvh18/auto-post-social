# Plan 24 — Nhập bài từ link Google Drive (nhiều link một lần)

**Milestone:** Phase 2
**Trạng thái:** 🟡 code + test xong (2026-08-07) — **chưa test tay trên UI/Drive thật**
**Kỹ thuật cốt lõi — ĐÃ CHỐT:** dùng **`drive.files.copy`** (copy phía server của Google).
**Tuyệt đối KHÔNG tải file về server rồi đẩy lên lại** — không byte nào của file media
được đi qua backend trong luồng này. Xem §0.1.
**Phụ thuộc:** Plan 03 (Drive storage, DONE) · Plan 04/11 (content-assets, DONE) ·
Plan 22 (nhiều ảnh/1 bài) · **Plan 23 (upload qua hàng đợi) — dùng lại gần như toàn bộ
hạ tầng: bảng `media_upload_jobs`, dòng "mờ" trên `/content`, nút "Thử lại", cron dọn**
**Spec tham chiếu:** `docs/04-api-spec.md` §media/content-assets · `docs/08-bullmq.md`
(quy ước queue — plan này thêm queue thứ 3, **không sửa `docs/`**, ghi nợ như plan 23)

---

## 0. Phân tích & phản biện trước khi thiết kế

### 0.1 ✅ CHỐT: dùng `files.copy`, KHÔNG "download rồi upload"

Yêu cầu ban đầu viết là "download file từ Drive khác về folder Drive của tool". Nếu làm
đúng nghĩa đen (tải về server → đẩy lên Drive) thì mỗi file 500MB tốn: 500MB băng thông
xuống + 500MB lên, 500MB RAM (vì `DriveStorage.upload()` đang nhận `Buffer`), 500MB đĩa
tạm, vài phút chờ — tức nhân đúng mọi nỗi đau của plan 23 lên gấp đôi mà không được gì.

**Google Drive có `files.copy` — copy phía server của Google.** Cùng một tài khoản đã có
quyền đọc file nguồn thì chỉ cần **1 lời gọi API**, file xuất hiện trong folder đích,
**0 byte đi qua server của mình**, không RAM, không đĩa, không phụ thuộc đường truyền.
Một link 2GB cũng chỉ là một request.

⇒ Toàn bộ thiết kế dưới đây xoay quanh `files.copy`. Đây là lý do feature này **rẻ hơn
nhiều** so với upload file thường, và cũng là lý do các giới hạn của plan 23
(`MEDIA_UPLOAD_MAX_PENDING_JOBS=20`, `MEDIA_UPLOAD_CONCURRENCY=3`) **không nên áp lên nó**
— xem §3.5.

**Ràng buộc bất di bất dịch của plan này (user chốt 2026-08-07):** trong luồng nhập từ
link, backend **không được** gọi `createReadStream` / `readFile` / `upload(buffer)` lên
file media. Nếu lúc code phát hiện `files.copy` không đủ cho một trường hợp nào đó thì
**dừng lại báo user**, không tự ý quay về đường tải-về-đẩy-lên. Điều kiện nghiệm thu §5
có 1 mục đo đúng việc này: RSS backend không nhích lên khi nhập file 500MB.

### 0.2 Phản biện: có nên copy không, hay trỏ thẳng vào file nguồn?

Rẻ nhất về dung lượng là **không copy gì cả**: lưu thẳng `fileId` nguồn vào
`content_assets.drive_file_id`, lúc đăng thì `createReadStream` đọc từ Drive của người
khác. Đã cân nhắc và **bác bỏ**:

| | Copy về folder tool (chọn) | Trỏ thẳng file nguồn |
|---|---|---|
| Chủ sở hữu file | Tool | Người khác |
| Họ xoá/gỡ share sau 1 tháng | Không ảnh hưởng | **Bài chết, Bot đăng lỗi 404** |
| Xoá bài trong kho | Xoá được file Drive như hiện nay | 403 — không có quyền xoá |
| Dung lượng Drive | Tốn thêm 1 bản | Không tốn |
| Giả định của hệ thống ("mọi file nằm trong folder cấu hình") | Giữ nguyên | Vỡ |

Đổi lại phải chấp nhận **tốn quota Drive gấp đôi so với không copy** — với `authMode =
oauth2` trên Gmail free (15GB) đây là giới hạn thật, cần nói rõ với user. Với Shared
Drive (service account) thì theo quota của Workspace.

### 0.3 Ba quyết định — **user đã chốt 2026-08-07**

1. ✅ **CHỐT: caption luôn là `'-'` + ép `PENDING_REVIEW`** (và **user chốt thêm
   2026-08-07: modal không hỏi caption nữa**). DB `content_assets.caption` là `NOT NULL`.
   **Phản biện ban đầu:** `caption` chính là **nội dung đăng lên Facebook**; nếu người
   nhập là ADMIN thì `ContentAssetsService.create()` **tự duyệt** bài ⇒ Bot đủ điều kiện
   lấy đăng ⇒ **một bài "-" xuất hiện trên Page thật**. Vì modal rút còn 2 field nên
   **mọi** bài nhập từ link đều rơi vào ca này ⇒ `forceReview` không còn là nhánh phụ mà
   là hành vi mặc định: bài luôn vào **Chờ duyệt**, người dùng điền caption + danh mục
   lúc duyệt.

2. ❌ **CHỐT: KHÔNG nhận link folder** — chỉ link file. Dán link folder ⇒ báo lỗi
   `LINK_INVALID` với câu riêng ("Đây là link thư mục — hãy dán link từng file").
   `parseDriveLink` vẫn **nhận diện** được dạng folder để báo đúng câu, chỉ không đi lấy
   nội dung bên trong.
3. ✅ **CHỐT: có checkbox "Gộp tất cả ảnh thành 1 bài nhiều ảnh", tắt mặc định.** Mặc
   định **1 dòng = 1 bài**; bật lên thì N ảnh gom vào **1 job / 1 bài nhiều ảnh** (dùng
   lại nguyên đường của plan 22, trần `MAX_IMAGES_PER_CONTENT_ASSET` = 10).
   **Bổ sung 2026-08-07 — §0.6:** checkbox phải **bị khoá thật** khi lô không gộp được.

### 0.6 ✅ CHỐT: luật gộp = "toàn ảnh", và khoá checkbox bằng cách dò ngầm

**Facebook cho gộp cái gì (đã kiểm chứng lại theo yêu cầu user):** chỉ **nhiều ảnh**.
Bài feed nhiều ảnh dựng bằng cách upload từng ảnh `published=false` rồi `POST
/{page-id}/feed` kèm `attached_media[i]` — `attached_media` **chỉ nhận photo id**. Video
đi đường riêng (`POST /{page-id}/videos`) và **không** nhét vào `attached_media` được.
**Trộn ảnh + video trong một bài organic của Page qua API: KHÔNG được** (carousel trộn
chỉ có ở quảng cáo/Instagram). Khớp với kết luận sẵn có của plan 21/22.

⇒ Luật đúng **không phải** "chỉ video thì cấm" mà là: **có một video thôi là đã không gộp
được**. Ba ca bị chặn, mỗi ca một câu riêng: toàn video · trộn ảnh–video · quá 10 ảnh.

**Vấn đề:** link Drive không chứa tên/đuôi file, nên FE **không thể** biết ảnh hay video
nếu không hỏi Drive — mà §0.5 vừa bỏ bước "Kiểm tra". Giải: thêm endpoint **chỉ đọc**
`POST /media/drive-imports/inspect`, FE gọi **ngầm** (debounce 800ms sau khi ngừng gõ).
UI vẫn đúng 2 field như §0.5 — đây là lời gọi nền, không phải bước thao tác.

- Chưa dò xong ⇒ checkbox khoá kèm "Đang kiểm tra loại file của các link…".
- Dò hỏng (mất mạng/quá trần link) ⇒ **không khoá nhầm**: coi như chưa biết, backend vẫn
  chặn lại lúc submit.
- Đang tick mà người dùng dán thêm video ⇒ **tự bỏ tick**, không gửi đi một request chắc
  chắn bị từ chối.
- Backend **giữ nguyên** validate lúc submit (400 kèm câu đúng ca) — UI chỉ là lớp chặn
  sớm, không phải nguồn sự thật.

### 0.5 ✅ CHỐT (2026-08-07, sau khi code xong bản đầu): modal chỉ còn 2 field

User yêu cầu popup tab "Nhập từ link" **chỉ có**:

1. Ô **"Dán link, mỗi dòng một file"**
2. Checkbox **"Gộp tất cả ảnh đã chọn thành 1 bài nhiều ảnh"**

**Mọi thứ còn lại xử lý ngầm:** tiêu đề = tên file (bỏ đuôi), caption = `'-'` ⇒ bài vào
**Chờ duyệt**, danh mục = `DEFAULT_IMPORT_CATEGORY` (`'Chưa phân loại'`), không gán
page/editor. Mặc định **mỗi dòng = một `content_assets` riêng**; chỉ khi tick gộp mới gom
về **một** record nhiều ảnh.

**Hệ quả: bỏ luôn bước "Kiểm tra" và endpoint `preview`.** Bảng xem trước sinh ra để sửa
tiêu đề/tick từng dòng — không còn thứ đó thì nó chỉ là một cú bấm thừa. Thay bằng:
`POST /media/drive-imports` **tự soi từng dòng**, nhập những dòng dùng được và trả
`{ jobs, skipped[], duplicates[] }`; modal **giữ nguyên** những dòng `skipped` trong ô dán
link kèm lý do để sửa rồi bấm lại. Chỉ khi **không dòng nào** dùng được mới trả 400.

**Đánh đổi đã biết:** không còn cách xem trước tên file trước khi nhập, và bài nhập vào
mang danh mục `'Chưa phân loại'` nên **Bot sẽ không tự đăng** cho tới khi có người sửa
danh mục lúc duyệt — đúng ý đồ "vào kho trước, biên tập sau".

### 0.4 ✅ CHỐT: quyền truy cập file nguồn — chỉ 2 đường, private thì báo lỗi

User chốt 2026-08-07 sau khi cân nhắc Google Picker / per-user OAuth / browser automation:

**Tool chỉ đọc được file nguồn qua đúng 2 đường:**
1. File được **share cho email tài khoản Drive đang cấu hình** (Viewer là đủ) — share ở
   cấp **folder** thì mọi file trong đó, kể cả file thêm sau, đều dùng được.
2. File để **"Bất kỳ ai có đường liên kết"** (public link).

**File private ⇒ báo lỗi rõ ràng, không tìm cách đi vòng.** Cụ thể: dòng đó hiện đỏ ở
bảng xem trước với `reason = NOT_FOUND_OR_NO_ACCESS`, câu chữ **nêu đúng email cần share
tới**, và không tạo job nào.

**Đã cân nhắc và LOẠI:**

| Phương án | Vì sao loại |
|---|---|
| Google Picker + OAuth theo từng user (copy bằng token người đang dùng tool) | Giải được ca private mà không cần chủ file hợp tác, nhưng khối lượng ~gấp đôi plan: thêm OAuth phía FE, phải share folder đích cho từng user, và bản copy do user tạo thì **user sở hữu + ăn quota Drive của user**. Không đáng cho một quy trình nội bộ mà việc share folder là làm được |
| Đổi tài khoản OAuth của tool sang tài khoản đang login trên máy | Kéo theo phải chuyển/chia sẻ folder cũ cho tài khoản mới, nếu không **toàn bộ bài đã có trong kho mất quyền đọc ⇒ Bot đăng lỗi 404**. Rủi ro lớn hơn lợi ích |
| Browser automation (Playwright) mượn phiên đăng nhập trên máy | Chỉ lấy được **bytes** qua trình duyệt ⇒ quay về đúng đường "tải về rồi đẩy lên" đã loại ở §0.1; phải nuôi phiên đăng nhập Google sống trên server (rủi ro bảo mật, 2FA/cảnh báo IP lạ làm gãy); và ca chủ file tắt "cho phép tải/sao chép" thì nó cũng chịu |

Quyền Drive gắn với **tài khoản**, không gắn với thiết bị — server không có cách nào
dùng phiên đăng nhập của trình duyệt trên máy user. Đây là giới hạn của Google, không
phải chỗ để lách.

---

## 1. Mục tiêu

Thêm bài vào kho bằng cách **dán danh sách link Google Drive** (mỗi dòng 1 link) thay vì
chọn file từ máy. Tool copy file về đúng folder Drive đang cấu hình, lấy **tên file làm
tiêu đề bài**, và tạo bản ghi `content_assets` y hệt đường upload — cùng dòng "mờ", cùng
nút "Thử lại", cùng luồng duyệt/phân bổ page.

## 2. Ngoài phạm vi

- Link **không phải Google Drive** (Dropbox, OneDrive, URL trực tiếp) — chỉ Drive.
- Google Docs/Sheets/Slides (`application/vnd.google-apps.*`, trừ shortcut) — không phải
  media, báo lỗi ở bước xem trước.
- **Đồng bộ 2 chiều / theo dõi thay đổi file nguồn** — copy 1 lần, xong là độc lập.
- **Fallback "tải về rồi đẩy lên" — LOẠI HẲN, không phải "để sau"** (§0.1). Chủ file
  chặn copy (`copyRequiresWriterPermission`) thì báo lỗi rõ ràng ở bước xem trước và
  hướng dẫn user xin quyền; trường hợp này hiếm, không đáng để kéo lại toàn bộ chi phí
  RAM/đĩa/băng thông mà `files.copy` vừa loại bỏ. Cần file đó thật thì tải tay về máy
  rồi dùng tab "Tải từ máy" (plan 23) — đường đó vẫn còn nguyên.
- **Link folder** (§0.3-2 user đã chốt không làm) — nhận diện để báo lỗi đúng câu, không
  lấy nội dung bên trong.
- **Google Picker · OAuth theo từng user · browser automation** (§0.4) — file private thì
  báo lỗi, không đi đường vòng. Tool luôn đọc file nguồn bằng **đúng tài khoản Drive đang
  cấu hình trong `/settings`**, không có tài khoản thứ hai nào trong luồng này.
- Sửa `DriveStorage.upload()` sang stream — vẫn là nợ kỹ thuật riêng của plan 23.

## 3. Thiết kế

### 3.1 Luồng (rút gọn theo §0.5)

```text
1. FE: user dán N dòng link + (tuỳ chọn) tick "gộp ảnh" → bấm Nhập
2. POST /media/drive-imports { links: string[], mergeImagesIntoOnePost?: boolean }
   BE soi từng dòng (song song tối đa 5):
     parseDriveLink() → fileId → files.get (metadata) → kiểm tra
     (link hỏng · folder · trùng trong lô · không có quyền · chặn copy ·
      không phải media · quá nặng · rate limit)
   Dòng hỏng KHÔNG làm hỏng cả lô: bỏ qua, gom vào `skipped`.
   Không dòng nào dùng được ⇒ 400 kèm lý do dòng đầu.
3. Tạo job (source = DRIVE_LINK, files = [{ sourceFileId, originalFilename, mimeType,
   size }], KHÔNG có tempPath) → queue `media-drive-import` → 202
   { jobs, skipped, duplicates }
4. FE: còn `skipped` ⇒ GIỮ modal, đổ đúng những dòng đó lại vào ô dán link kèm lý do;
   sạch ⇒ đóng modal, N dòng "mờ" xuất hiện (cơ chế plan 23)
5. Worker (DriveImportProcessor, concurrency = DRIVE_IMPORT_CONCURRENCY):
   status=COPYING_FROM_DRIVE → storage.copy(sourceFileId, tên file)
   → ContentAssetsService.create() (ĐÚNG hàm plan 23 đang gọi, actor = người nhập)
   → SUCCESS + contentAssetId
```

### 3.2 Backend — file mới/sửa

| File | Việc |
|------|------|
| `src/modules/media-upload-jobs/drive-link.util.ts` **(mới)** | `parseDriveLink(raw): { kind: 'file' \| 'folder'; id: string } \| null` — hàm thuần, **bắt buộc test** (nhiều dạng URL, dễ sai) |
| `src/infra/drive/drive-storage.interface.ts` | thêm `copy(fileId, name?): Promise<DriveFile>` và `getMetadata(fileId): Promise<DriveFileMeta>` (không cần `listFolder` — §0.3-2 bỏ link folder) |
| `src/infra/drive/google-drive.storage.ts` | hiện thực 3 method trên (`supportsAllDrives: true`, `fields` như §3.1; `files.copy` với `parents: [folderId]`) |
| `src/infra/drive/drive.errors.ts` | map 403 `cannotCopyFile` / 404 → domain error có mã để §3.1 phân biệt `reason` |
| `.../drive-imports.service.ts` **(mới)** | `createJobs()` (soi + tạo, trả báo cáo) + `processImport()` |
| `.../drive-imports.controller.ts` **(mới)** | 1 endpoint dưới |
| `.../drive-import.processor.ts` **(mới)** | ~40 dòng, giống `media-upload.processor.ts` |
| `.../media-upload-jobs.service.ts` | tách nhánh theo `source`; `removeTempFiles`/`retry`/`cleanup` phải bỏ qua job không có file tạm |

Endpoint:

| Method | Path | Quyền | Việc |
|--------|------|-------|------|
| POST | `/media/drive-imports/inspect` | `content:create` | **Chỉ đọc** — loại file từng dòng, để UI khoá checkbox "gộp ảnh" (§0.6) |
| POST | `/media/drive-imports` | `content:create` | Soi + tạo job trong **một** lần gọi, trả **202** `{ jobs, skipped, duplicates }` |

(Endpoint `preview` của bản thiết kế đầu **đã bỏ** — xem §0.5.)

Retry dùng lại `POST /media/upload-jobs/:id/retry` sẵn có (job drive-link **luôn** retry
được vì file nguồn còn đó — điều kiện `filesRemovedAt === null` tự đúng).

### 3.3 Schema (⇒ **bắt buộc cập nhật `erd.md` cùng lúc**, rule 05)

Không thêm bảng mới. Sửa `media_upload_jobs`:

```prisma
enum MediaUploadSource {
  LOCAL_FILE   // plan 23 — multipart từ máy user
  DRIVE_LINK   // plan 24 — copy từ Drive khác
}

enum MediaUploadStatus {
  QUEUED
  UPLOADING_TO_DRIVE
  COPYING_FROM_DRIVE   // ← thêm
  SUCCESS
  FAILED
}

model MediaUploadJob {
  ...
  source MediaUploadSource @default(LOCAL_FILE) @map("source")
  ...
  @@index([source, status])   // guard đếm riêng theo nguồn (§3.5)
}
```

`files` (jsonb) đổi shape: `tempPath` thành optional, thêm optional `sourceFileId`.
Dòng cũ vẫn đọc được ⇒ **không cần backfill**, chỉ cần `@default(LOCAL_FILE)`.

**Chống nhập trùng (§3.4):** thêm `content_assets.source_drive_file_id` (nullable) +
index — để biết "link này đã nhập vào bài X rồi". Đây là **cảnh báo, không chặn** (user
có thể cố ý nhập lại).

### 3.4 Bảng `reason` của dòng bị bỏ qua (`skipped[]`)

| reason | Khi nào | Câu hiện cho user |
|---|---|---|
| `LINK_INVALID` | `parseDriveLink` trả null | "Không nhận ra link Google Drive" |
| `IS_FOLDER` | link dạng `/drive/folders/<id>` | "Đây là link thư mục — hãy dán link từng file" |
| `NOT_FOUND_OR_NO_ACCESS` | Drive trả 404/403 | **Ca chính của §0.4** — "File đang ở chế độ riêng tư. Hãy chia sẻ file (hoặc cả thư mục chứa nó) cho **\<email tài khoản Drive đang kết nối\>** với quyền Người xem, hoặc đổi sang *Bất kỳ ai có đường liên kết*." Email lấy từ `oauthAccountEmail` (authMode oauth2) hoặc `client_email` trong service-account JSON (giải mã lấy **đúng field email**, không log/không trả gì khác) |
| `COPY_DISABLED` | `capabilities.canCopy = false` | "Chủ file đã tắt quyền tải/sao chép — xin quyền Editor hoặc nhờ họ tắt tuỳ chọn đó" |
| `NOT_MEDIA` | mime không thuộc whitelist `resolveMediaType` | "Chỉ nhận ảnh JPG/PNG/WebP và video MP4/MOV" |
| `TOO_LARGE` | `size > maxUploadMb` | "Vượt giới hạn N MB" — **vẫn áp** dù copy không tốn gì của mình, vì **lúc ĐĂNG** file phải chảy qua server (Drive → RAM → Facebook), đúng chỗ đau của plan 20 |
| `DUPLICATE_IN_LIST` | cùng fileId đã xuất hiện ở dòng trên (kể cả khác dạng URL) | "Link này bị dán trùng ở phía trên" |

File đã từng nhập vào kho **không** nằm trong `skipped` mà ở `duplicates[]` — vẫn nhập
bình thường, chỉ hiện toast cảnh báo (plan cho phép cố ý nhập lại).

Shortcut (`application/vnd.google-apps.shortcut`) ⇒ resolve `shortcutDetails.targetId` rồi
`files.get` lần nữa, không báo lỗi.

### 3.5 Giới hạn — **không dùng chung với plan 23**

`MediaUploadLimitGuard` hiện đếm mọi job `QUEUED`/`UPLOADING_TO_DRIVE` với trần 20. Nếu
để nguyên, dán 30 link là dính 503 ngay — trong khi job drive-link **không tốn đĩa, không
tốn RAM, không tốn băng thông**. Trần 20 sinh ra để chặn *đĩa tạm*, không áp được ở đây.

- Guard cũ: thêm điều kiện `source = LOCAL_FILE` ⇒ giữ nguyên đúng ý nghĩa "trần đĩa tạm".
- Giới hạn mới cho drive-import: `DRIVE_IMPORT_MAX_LINKS_PER_REQUEST` (mặc định **50**) —
  chặn ở DTO/service, message rõ ràng, **không** trần tổng hệ thống.
- **Queue riêng `media-drive-import`** thay vì dùng chung queue `media-upload`: một video
  500MB đang chiếm 3 slot worker sẽ chặn đầu hàng đợi (head-of-line) 50 lệnh copy vốn chỉ
  mất vài giây mỗi cái. Tách queue là ~40 dòng code, đổi lại 2 loại việc không giành slot
  của nhau.

### 3.6 Env mới (`.env.example` + `.env.production.example`, rule 04)

```bash
# ── Nhập bài từ link Google Drive (plan 24) ──────────────────────
# Số lệnh copy Drive chạy song song. Copy là server-side (không tốn RAM/băng thông
# của mình) nên để cao hơn MEDIA_UPLOAD_CONCURRENCY được.
DRIVE_IMPORT_CONCURRENCY=5
# Số link tối đa trong 1 lần dán/1 request.
DRIVE_IMPORT_MAX_LINKS_PER_REQUEST=50
```

### 3.7 Frontend

Tab thứ hai trong chính modal "Thêm Ảnh/Video vào kho" (không phải nút thứ 3 trên
toolbar): cùng một đích đến "thêm bài vào kho", tách modal riêng khiến user phải nhớ 2 chỗ.

```
┌ Thêm Ảnh/Video vào kho ──────────────────────────────┐
│ [ Tải từ máy ] [ Nhập từ link Google Drive ]          │
│                                                       │
│ ⓘ File phải được chia sẻ cho tài khoản Drive của tool │
│   hoặc để "Bất kỳ ai có đường liên kết".              │
│   Mỗi dòng là một bài, tiêu đề lấy theo tên file.     │
│   Bài vào Chờ duyệt — điền caption/danh mục khi duyệt.│
│                                                       │
│ Dán link, mỗi dòng một file                           │
│ ┌───────────────────────────────────────────────────┐ │
│ │ https://drive.google.com/file/d/1AbC.../view      │ │
│ │ https://drive.google.com/file/d/1XyZ.../view      │ │
│ └───────────────────────────────────────────────────┘ │
│ 2 link                                                │
│                                                       │
│ ☐ Gộp tất cả ảnh đã chọn thành 1 bài nhiều ảnh        │
│                                                       │
│ ⚠ 1 dòng chưa nhập được — đã giữ lại trong ô trên     │
│   Dòng 2: File đang ở chế độ riêng tư… chia sẻ cho    │
│   tool-drive@… hoặc đổi sang "Bất kỳ ai có link".     │
│                              [ Huỷ ]  [ Nhập 2 bài ]  │
└───────────────────────────────────────────────────────┘
```

- `api/driveImports.api.ts` (`create`), `hooks/useDriveImports.ts`.
- Modal `footer={null}` khi ở tab này — panel tự dựng nút Huỷ/Nhập.
- Còn `skipped` ⇒ **không đóng modal**, ghi đè ô dán link bằng đúng những dòng chưa nhập
  được: sửa xong bấm lại là xong, không phải tự lọc dòng nào đã vào rồi.

## 4. Task

- [x] Chốt §0.3 với user (caption rỗng ⇒ Chờ duyệt · **không** nhận link folder · **có**
      checkbox gộp ảnh) — 2026-08-07
- [x] `drive-link.util.ts` + test (23 test: mọi dạng URL, folder, dán thẳng ID, link rác,
      khoảng trắng thừa, dòng rỗng, trùng lặp, CRLF, tiêu đề từ tên file)
- [x] `DriveStorage`: `copy()` / `getMetadata()` + test (11 test, mock `drive_v3`)
- [x] `drive.errors.ts`: `DriveFileError` có mã + `mapDriveFileError()` (giữ nguyên
      `mapDriveError` cũ cho upload/stream/delete để không đổi hành vi đang chạy)
- [x] `SettingsService.getDriveAccountEmail()` — mượn lại `getDriveSettings()` (bản đã
      mask) nên chỉ chạm đúng field email
- [x] Migration `20260807130353_drive_link_import` + **`erd.md` đã cập nhật**
- [x] `DriveImportsService.createJobs()` (soi + tạo + báo cáo) + `processImport()` + test
      (đủ 8 `reason`, shortcut, trùng trong lô, dòng hỏng không làm hỏng cả lô)
- [x] Rút modal còn 2 field theo §0.5: bỏ DTO/endpoint `preview`, bỏ ô danh mục/caption/
      hashtag/page/editor; thêm `DEFAULT_IMPORT_CATEGORY`
- [x] §0.6: endpoint `inspect` + dò ngầm có debounce ở FE, khoá checkbox "gộp" cho cả 3 ca
      (toàn video · trộn ảnh–video · quá 10 ảnh) + test 2 phía
- [x] `MediaUploadLimitGuard` chỉ đếm `source = LOCAL_FILE` + test
- [x] `retry`/`cleanup`/`onModuleInit`/mapper chịu được job không có `tempPath`
- [x] 2 endpoint + DTO + Swagger
- [x] FE: tab mới trong modal, bảng xem trước, api + hook, nhãn `COPYING_FROM_DRIVE`
- [x] `.env.example` + `.env.production.example` (2 biến §3.6)
- [x] `npm run lint && npm run build` xanh 2 phía + test xanh (BE 826, FE 48)
- [x] Cập nhật `contexts.md`
- [ ] **Test tay trên UI + Drive thật** (§5) — chưa làm

## 5. Điều kiện nghiệm thu

- [ ] Dán 3 link (1 hợp lệ, 1 **private chưa share**, 1 rác) → bấm Nhập: bài hợp lệ vào
      kho, modal **ở lại** với đúng 2 dòng hỏng; dòng private **nêu đúng email tài khoản
      Drive đang kết nối** và gợi ý cả 2 đường của §0.4
- [ ] Link file để **public "bất kỳ ai có đường liên kết"** (không share riêng cho tài
      khoản tool) → nhập được bình thường
- [ ] Mọi link hợp lệ → Nhập → modal đóng ngay, dòng "mờ" hiện, vài giây sau thành bài
      thật với **tiêu đề = tên file** (đã bỏ đuôi mở rộng), trạng thái **Chờ duyệt**
- [ ] Tick "Gộp ảnh" với 3 link ảnh ⇒ **1** bài duy nhất có badge "+2 ảnh"; bỏ tick ⇒ 3 bài
- [ ] Dán toàn link **video** ⇒ checkbox "gộp" **bị khoá**, tooltip nói rõ lý do; dán trộn
      ảnh + video cũng khoá; đang tick sẵn rồi dán thêm video ⇒ **tự bỏ tick**
- [ ] Mở Google Drive folder của tool: file đã nằm ở đó, **kích thước đúng bản gốc**
- [ ] Dán 10 link cùng lúc → 10 bài, không dính 503, không job nào chặn job nào
- [ ] Video ~500MB: bấm Nhập xong gần như **tức thì** (khác hẳn upload từ máy) và RSS
      của backend **không nhích lên** theo dung lượng file
- [ ] Nhập lại đúng link đã nhập → toast cảnh báo "đã từng nhập" nhưng vẫn nhập được
- [ ] Người nhập là ADMIN → bài vẫn ở **Chờ duyệt** (không tự APPROVED), Bot không đăng
- [ ] Bài nhập bằng link: xoá bài ⇒ file trong folder tool bị xoá, **file gốc bên Drive
      người khác còn nguyên**
- [ ] Gỡ quyền chia sẻ giữa chừng → job FAILED với message rõ, "Thử lại" chạy được sau
      khi share lại

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Chủ file tắt "cho phép tải/sao chép" ⇒ `files.copy` 403 | Bắt ngay ở bước xem trước bằng `capabilities.canCopy`, không để lòi ra ở worker; câu lỗi chỉ đúng việc cần làm |
| Quota Drive đích đầy (Gmail free 15GB) | Map lỗi `storageQuotaExceeded` thành message riêng ("Drive của tài khoản kết nối đã đầy"), **không** để lẫn vào "lỗi không xác định" |
| Nhập trùng file ⇒ đăng lặp nội dung lên Page | Cột `source_drive_file_id` + cảnh báo `ALREADY_IMPORTED` (cảnh báo, không chặn) |
| Caption `'-'` bị Bot đăng thẳng lên Page thật | §0.3-1: caption rỗng ⇒ ép `PENDING_REVIEW` bất kể role |
| Dán 200 link ⇒ 200 job | `DRIVE_IMPORT_MAX_LINKS_PER_REQUEST=50`, chặn ở DTO |
| Preview gọi Drive API 50 lần đồng loạt ⇒ rate limit | Giới hạn song song 5 + `reason` riêng cho lỗi 429, cho bấm Kiểm tra lại |
| Job drive-link lọt vào code dọn file tạm của plan 23 ⇒ log rác / nhầm `filesRemovedAt` | `removeTempFiles`/`cleanup` bỏ qua file không có `tempPath`; có test riêng cho nhánh này |
| `docs/08-bullmq.md` chưa mô tả queue thứ 3 | Không sửa `docs/` (rule 00), ghi nợ `contexts.md` §6 như plan 23 |

---

## 7. Kết quả

- **Ngày xong (code):** 2026-08-07 — **chưa nghiệm thu trên UI/Drive thật**
- **File chính:**
  - BE: `backend/src/modules/media-upload-jobs/{drive-link.util,drive-imports.service,
    drive-imports.controller,drive-import.processor}.ts` + `dto/{preview-drive-import,
    create-drive-import}.dto.ts`; `backend/src/infra/drive/{drive-storage.interface,
    google-drive.storage,drive.errors,drive-storage.factory}.ts`;
    `backend/prisma/migrations/20260807130353_drive_link_import/`
  - FE: `frontend/src/api/driveImports.api.ts`, `frontend/src/hooks/useDriveImports.ts`,
    `frontend/src/components/common/DriveImportPanel.tsx`,
    `frontend/src/pages/ContentManagementPage.tsx` (modal thành 2 tab)
- **Khác thiết kế ban đầu:**
  1. **Khung chạy job tách thành `MediaUploadJobsService.runJob()`** dùng chung cho cả 2
     luồng, thay vì `DriveImportsService` tự viết lại vòng đời trạng thái. Lý do: luật
     "lỗi khi **còn lượt retry** ⇒ trả job về `QUEUED`, không phải `FAILED`" (cạm bẫy đã
     trả giá ở plan 23) mà chép ra bản thứ hai thì sớm muộn cũng lệch.
  2. Thêm `reason` **`DUPLICATE_IN_LIST`** (ngoài 7 reason của §3.4): cùng một file dán 2
     lần bằng 2 dạng URL khác nhau vẫn phải bị bắt, và chỉ tốn 1 lời gọi Drive.
  3. `retry` cũ chặn theo `filesRemovedAt`; job `DRIVE_LINK` **luôn** thử lại được vì
     nguồn nằm bên Drive chứ không phải file tạm trên đĩa — sửa cả service lẫn mapper
     (`canRetry`).
  4. `PENDING_STATUSES` thêm `COPYING_FROM_DRIVE` (dọn job kẹt lúc boot phải thấy nó),
     nhưng `countPending` đổi tên thành **`countPendingLocalFiles`** và lọc theo `source`
     — trần 20 là trần **đĩa tạm**, không phải trần "việc đang chạy".
  5. `createJobs()` **đọc lại metadata từ Drive**, không tin `mimeType`/`size` client gửi
     lên: bước xem trước là UX, không phải ranh giới tin cậy.
  6. FE: bắt được một lỗi thật khi viết test api — `apiRequest` đã tự `JSON.stringify`,
     truyền chuỗi vào `body` sẽ thành JSON lồng JSON.
  7. **Rút modal còn 2 field + bỏ bước "Kiểm tra" (§0.5, user chốt sau khi xem bản đầu).**
     Endpoint `preview` và bảng xem trước đã bị xoá; `POST /media/drive-imports` giờ soi
     link **và** tạo job trong một lần gọi, trả `{ jobs, skipped, duplicates }`. Đổi lại
     phải làm rõ ngữ nghĩa lỗi: dòng hỏng **không** làm hỏng cả lô (202 + `skipped`), chỉ
     "không dòng nào dùng được" mới là 400 — nếu không thì một link sai chính tả sẽ chặn
     cả 20 link đúng còn lại.
  8. Thêm `DEFAULT_IMPORT_CATEGORY = 'Chưa phân loại'` vì modal không hỏi danh mục nữa.
  9. **§0.6 — `inspect` quay lại dưới dạng lời gọi ngầm.** Bỏ preview (§0.5) khiến FE mất
     đường biết ảnh/video, mà muốn *khoá* checkbox thì bắt buộc phải biết trước. Endpoint
     mới chỉ đọc, FE gọi có debounce; UI vẫn đúng 2 field.
- **Test:** BE **+65 test (832 tổng, tất cả xanh)** · FE **+4 test (49 tổng)** ·
  lint + build xanh 2 phía.
- **Còn nợ:**
  1. **Chưa bấm tay trên UI/Drive thật** — toàn bộ §5 chưa nghiệm thu (đặc biệt: file
     private ⇒ câu lỗi nêu đúng email, video 500MB nhập gần như tức thì và RSS không
     nhích, xoá bài không đụng file gốc).
  2. `docs/08-bullmq.md` vẫn chỉ mô tả queue `publish-facebook` — nay đã có **3** queue
     (`publish-facebook`, `media-upload`, `media-drive-import`). Không tự sửa `docs/`
     (rule 00), cộng dồn vào nợ sẵn có của plan 23.
  3. Chưa có test cho `DriveImportsController`/`DriveImportProcessor` (lớp mỏng, theo
     rule 02 không bắt buộc) và chưa có e2e cho `POST /media/drive-imports`.
  4. Bài nhập từ link mang danh mục `'Chưa phân loại'` ⇒ **Bot không tự đăng** cho tới khi
     người duyệt đổi danh mục. Đúng ý đồ, nhưng nếu sau này thấy vướng thì cân nhắc cho
     chọn danh mục ngay ở modal (user đã chốt bỏ, không tự ý thêm lại).

---

## Bổ sung 2026-08-08 — checkbox "Copy data" (mặc định TẮT)

**Lý do (user):** copy mọi file về folder Drive đang cấu hình làm phình dung lượng Drive
cá nhân. Nay copy là **tuỳ chọn**, mặc định **không** copy.

- [x] `POST /media/drive-imports` nhận `copyData?: boolean` (mặc định `false`), lưu vào
      `metadata.copyToDrive` của job.
- [x] `copyToDrive = false` ⇒ worker **không** gọi `files.copy`: `content_assets.drive_file_id`
      = fileId **gốc**, `drive_url`/`thumbnail_url` lấy từ metadata file gốc (đã đọc sẵn lúc
      soi link, không gọi Drive thêm lần nào).
- [x] `DriveFileMeta` thêm `webViewLink`/`thumbnailLink`; `MediaUploadFileInfo` thêm
      `sourceWebViewLink`/`sourceThumbnailLink`.
- [x] **Chặn xoá file của người khác:** `removeExisting()` chỉ gọi `storage.delete()` khi
      `drive_file_id !== source_drive_file_id`. Bài nhập-không-copy có hai cột **trùng nhau**
      ⇒ đó là dấu hiệu "file thuộc người khác", chỉ xoá bản ghi DB.
- [x] FE: checkbox "Copy data về Drive của tool" trong tab nhập link, mặc định không tick,
      kèm dòng giải thích đánh đổi.
- [x] Test: BE +6 (drive-imports 2 chiều cờ, no-copy path, không xoá file gốc), lint + build
      xanh 2 phía.

**Vẫn giữ check `canCopy`** kể cả chế độ không copy: lúc đăng bài, publisher phải **tải bytes**
từ Drive, mà file bị tắt quyền tải/sao chép thì `alt=media` cũng 403 — bỏ check ở đây chỉ đẩy
lỗi sang lúc đăng.

**Còn nợ thêm:** chưa bấm tay — cần thử (1) không tick ⇒ folder tool **không** sinh file mới mà
bài vẫn đăng được lên page thật; (2) xoá bài nhập-không-copy ⇒ file gốc **còn nguyên**.
