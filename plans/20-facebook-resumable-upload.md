# Plan 20 — Facebook resumable upload cho video

**Milestone:** sau M10 — vá bug production, trả nợ kỹ thuật #22 ở `contexts.md`
**Trạng thái:** 🟡 đang làm
**Phụ thuộc:** Plan 17 (publish media optimize — `openAsBlob`, `MediaCacheService`) — đã xong
**Spec tham chiếu:** không có spec riêng trong `docs/`; theo tài liệu chính thức
Meta Graph API "Resumable Upload API"

---

## 1. Mục tiêu

Video ~180MB đăng thủ công/auto-post bị lỗi `502 Lỗi khi đăng video lên Page:
không rõ nguyên nhân` (body lỗi trả về không phải JSON — log
`code=undefined subcode=undefined trace=undefined message=undefined`). Nguyên
nhân: code hiện đẩy **toàn bộ file trong 1 POST multipart** tới
`graph-video.facebook.com/{pageId}/videos` — endpoint đồng bộ này không ổn định
với file lớn/đường truyền chậm, đúng như Meta cảnh báo và đúng như tech debt đã
ghi ở `contexts.md` mục #22.

Sau feature: video (mọi kích thước) đăng qua **Resumable Upload API** của Meta —
chia làm nhiều chunk theo `start_offset`/`end_offset` do chính Facebook điều
khiển, mỗi chunk có retry riêng — không còn phụ thuộc việc đẩy trọn file thành
công trong 1 request.

## 2. Ngoài phạm vi

- Ảnh (`publishImage`) — không đổi, vẫn 1 POST `/photos` như cũ.
- Chunk size tự chọn — dùng đúng `start_offset`/`end_offset` Facebook trả về mỗi
  vòng, không tự tính chunk size cố định.
- Resumable upload cho ảnh — Graph không cần, ảnh luôn nhỏ.
- Tách queue ảnh/video, nâng `concurrency` worker — nợ khác (#23 `contexts.md`).
- Lưu lại `upload_session_id` để **tiếp tục** upload dở sau khi process crash —
  không làm ở MVP; job publish rớt thì coi như thất bại, để lần đăng lại tải file
  từ đầu (đúng hành vi hiện tại của publish job nói chung).

## 3. Thiết kế

### 3.1 Luồng 3 pha (theo tài liệu Meta)

```text
1. start:    POST /{pageId}/videos  upload_phase=start  file_size=<bytes>
             → { video_id, upload_session_id, start_offset, end_offset }
2. transfer: POST /{pageId}/videos  upload_phase=transfer  upload_session_id
             start_offset  video_file_chunk=<blob.slice(start_offset,end_offset)>
             → { start_offset, end_offset }   (lặp tới khi start_offset === end_offset)
3. finish:   POST /{pageId}/videos  upload_phase=finish  upload_session_id
             description=<message>
             → { success: true }
postId = video_id lấy từ bước start.
```

### 3.2 `facebook-publisher.client.ts`

- Bỏ nhánh single-POST cũ của `publishVideo`, thay bằng
  `uploadResumableVideo(input)` chạy 3 pha trên.
- Cắt chunk bằng `blob.slice(start, end, mimeType)` trên Blob từ
  `openAsBlob(path)` — `slice` không đọc file vào RAM (đúng tinh thần Plan 17,
  Blob file-backed của Node giữ tham chiếu, không copy).
- Guard vòng lặp transfer: nếu Facebook trả offset không tăng hoặc NaN → ném lỗi
  domain thay vì loop vô hạn.
- Retry ở **mỗi pha** (start/transfer/finish riêng lẻ) tối đa
  `FB_VIDEO_CHUNK_RETRIES` lần (mặc định 3), **không** delay giữa các lần — lỗi
  mạng thoáng qua thường tự khỏi ngay, và không cần thêm cơ chế fake-timer cho
  test. Hết lượt retry vẫn lỗi → ném `FacebookGraphError` như cũ (giữ nguyên
  hành vi 502 lên `ManualPostService`/publisher job).
- Dùng lại `post()` + `mapFacebookError` sẵn có cho cả 3 pha — không cần đổi
  cách xử lý lỗi Graph.

### 3.3 `PublishFileInput` cần thêm `size`

`MediaCacheService.withLocalFile` đã trả `LocalMediaFile.size` sẵn —
`publish-media.service.ts` chỉ cần truyền thêm field này vào `input.file`.

## 4. Task

- [x] Thêm `FB_VIDEO_CHUNK_RETRIES` (env.validation.ts, app-config.service.ts,
      `.env.example`, `.env.production.example`)
- [x] `PublishFileInput.size`, cập nhật `publish-media.service.ts`
- [x] Viết `uploadResumableVideo` (start/transfer/finish + retry + guard loop)
      trong `facebook-publisher.client.ts`, xoá nhánh POST cũ
- [x] Unit test: happy path 1 chunk · nhiều chunk · start lỗi Graph · transfer
      lỗi mạng rồi retry thành công · transfer hết retry vẫn lỗi ⇒
      `FacebookGraphError` · finish `success:false` ⇒ lỗi · offset không tiến ⇒
      lỗi (chặn vòng lặp vô hạn) · ảnh (`publishImage`) không đổi hành vi
- [x] `npm run lint && npm run build && npm run test` xanh
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] Video giả lập nhiều chunk (mock `fetch`) đăng thành công, `postId` lấy từ
      `video_id` của bước start
- [x] Lỗi Graph ở bất kỳ pha nào ⇒ `FacebookGraphError` tiếng Việt như cũ, có
      log `code/subcode/trace/message`
- [x] Toàn bộ test cũ (manual-post, auto-post, publish-media) vẫn xanh
- [ ] Test tay VPS thật: đăng 1 video ≥180MB qua đăng thủ công **và** auto-post
      — không còn 502 (cần token/page thật, đánh dấu ở `contexts.md` §6 nếu
      chưa làm được ngay)

## 4b. Phát sinh sau khi user test tay (2026-08-05)

User test tay đăng 1 video 180MB, phát hiện 2 việc ngoài dự kiến ban đầu của
plan này — ghi lại lý do thêm task thay vì âm thầm làm thêm (rule 03):

1. **`/timeline` hiện 2 record cùng slot: 1 Thất bại + 1 Thành công.** Điều tra:
   không phải bug hiển thị — là **2 `publish_jobs` row thật**. `ManualPostService.
   publishNow` không có guard chống gọi trùng: sau khi 1 lần đăng FAILED, user
   bấm lại "Đăng bài thủ công" (thay vì nút "Đăng lại" trên chính job đó) tạo
   thêm 1 job **mới** hoàn toàn, độc lập, thành công lần 2. Vì sao thêm task ở
   đây thay vì tách plan riêng: guard này chặn đúng chỗ đường publish vừa đổi
   (resumable upload) hay thất bại giữa chừng — cùng bối cảnh smoke-test plan 20.
2. Nhân tiện phát hiện `content-picker.repository.ts` (auto-post) có cùng lỗ
   hổng: chỉ loại content có job `QUEUED`/`PUBLISHING`, **không loại `FAILED`**
   ⇒ Bot có thể tự re-pick nội dung vừa đăng lỗi ở tick sau, tạo thêm job trùng
   một cách âm thầm (rủi ro nặng hơn manual vì không ai bấm nút). Sửa cùng lúc
   vì là cùng một loại lỗi (thiếu chặn trùng theo content+page).
3. User yêu cầu thêm test đảm bảo **video không bị hỏng** khi chia chunk qua
   Resumable Upload API — thêm test byte-exact: ghép các chunk gửi lên phải
   khớp 100% file gốc.
4. User hỏi tốc độ đăng video 180MB mất ~4 phút có tối ưu được không — thêm log
   thời lượng + số chunk ở cuối `publishVideo` để lần test tay sau đo được là
   nghẽn băng thông VPS hay nghẽn giao thức (nhiều round-trip).

- [x] `ManualPostRepository.findBlockingJob` + guard 409 trong `ManualPostService.publishNow`
- [x] `content-picker.repository.ts`: loại thêm `FAILED` khỏi diện được Bot re-pick
- [x] Test byte-exact: chunk gửi lên Facebook ghép lại đúng 100% file gốc
- [x] Log thời lượng + số chunk khi `publishVideo` xong (thành công lẫn thất bại)
- [x] Cập nhật test picker (rule 02 — cron picker là vùng bắt buộc phủ) cho case `FAILED`
- [x] `npm run lint && npm run build && npm run test` xanh (710 test)

**Lệch spec phát hiện, không tự sửa (rule 00 §1):** `docs/03-database-design.md`
dòng 381 mẫu SQL picker chỉ có `j.status IN ('QUEUED', 'PUBLISHING')`, thiếu
`FAILED` — code giờ đã đúng hơn spec. Đã báo user, ghi vào `contexts.md` §6
thay vì tự sửa `docs/`.

## 4c. Test tay lần 1 (2026-08-05) — kết quả tốc độ

User test video 162.5MB thật trên VPS: **171 chunk, 184.6s, ~7.4 Mbps**. Đối
chiếu bằng `curl` upload thô lên Cloudflare (không qua Facebook): **~310 Mbps**
— chênh lệch ~42 lần, loại bỏ giả thuyết "băng thông VPS yếu chung chung". Còn
lại 2 khả năng: (a) Facebook chủ động giới hạn tốc độ cho cả phiên resumable
upload (không sửa được bằng code), hoặc (b) 171 lần gọi `fetch` không tái dùng
chung 1 kết nối TCP/TLS, mỗi lần bắt tay lại tốn thời gian nếu RTT tới máy chủ
Facebook cao (**sửa được** nếu đúng). Log tổng (chỉ có tổng thời lượng + tổng
số chunk) không đủ để phân biệt 2 khả năng này.

- [x] Thêm thời lượng riêng từng chunk vào log tổng kết `publishVideo`: chunk
      đầu (dễ bị ảnh hưởng bắt tay kết nối) so với TB/min/max các chunk sau
      (nếu kết nối tái dùng tốt, chunk sau phải nhanh hơn hẳn chunk đầu; nếu
      đều nhau suốt ⇒ nghiêng về giả thuyết Facebook throttle)
- [x] `npm run lint && npm run build && npm run test` xanh (710 test, không đổi
      số lượng — chỉ đổi format log, không có test riêng cho một dòng log)

**Còn phải làm:** test tay lần 2 trên VPS để đọc dòng log mới, xác định 2 khả
năng trên khả năng nào đúng — xem `contexts.md` §6 mục 22.

## 4d. Test tay lần 2 (2026-08-05) — kết luận tốc độ

Video 130.5MB: **137 chunk, 200.3s, ~5.5 Mbps — chunk đầu 1622ms, 136 chunk sau
TB 1425ms (min 881/max 6300)**.

- Chunk đầu chỉ chậm hơn TB các chunk sau **~14%** (1622ms vs 1425ms) — nếu do
  lỗi tái dùng kết nối (bắt tay TCP/TLS lại mỗi request) thì chunk đầu phải
  chậm hơn hẳn (2-5 lần), không phải chênh nhẹ như vậy. **⇒ Loại bỏ giả thuyết
  (b) lỗi tái dùng kết nối trong code.**
- Biên độ min/max chunk sau chênh nhau **~7 lần** (881ms – 6300ms) dù các chunk
  cùng kích thước (~0.95MB) — dấu hiệu đặc trưng của rate-limit kiểu "bucket"
  phía Facebook (lúc nhanh lúc bị giữ), không phải nghẽn băng thông ổn định.

**Kết luận: tốc độ ~5.5-7.4 Mbps là do Facebook giới hạn tốc độ phiên Resumable
Upload video — không phải lỗi/điểm nghẽn trong code, không có cách tối ưu thêm
bằng code (Graph API không cho client xin chunk lớn hơn hay tốc độ cao hơn).**
Đóng phần điều tra tốc độ ở đây. Việc còn lại của plan 20 chỉ còn: test job
trùng bị chặn 409 trên UI thật, và theo dõi RSS khi upload video lớn.

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| `Blob.slice()` trên Blob file-backed của Node âm thầm đọc hết vào RAM | Đo RSS thật khi test tay video lớn trên VPS (giống cách Plan 17 đã đo) |
| Facebook đổi hành vi offset (vd trả `end_offset` giảm) | Guard: offset không tăng ⇒ ném lỗi thay vì loop |
| Retry không delay dồn dập gọi Graph khi rớt mạng thật (không phải lỗi thoáng qua) | Vẫn giới hạn cứng `FB_VIDEO_CHUNK_RETRIES` lần rồi bỏ cuộc — không retry vô hạn |
| Video rất nhỏ (vài trăm KB) qua 3 pha thay vì 1 POST — chậm hơn chút | Chấp nhận, đổi lấy độ ổn định cho file lớn; số round-trip thêm không đáng kể |

---

## 7. Kết quả

- **Ngày xong (code):** 2026-08-05 — **chưa smoke VPS thật**, xem §6 mục 22 `contexts.md`.
- **File chính:**
  - `backend/src/infra/facebook/facebook-publisher.client.ts` (`publishVideo` viết
    lại: `startVideoUpload`/`transferVideoChunk`/`finishVideoUpload`/`withRetry`,
    log thời lượng/chunk/Mbps ở `describeUploadTiming`)
  - `backend/src/infra/facebook/facebook-publisher.interface.ts` (`PublishFileInput.size`)
  - `backend/src/modules/publish-jobs/publish-media.service.ts` (truyền `file.size`)
  - `backend/src/config/env.validation.ts`, `app-config.service.ts` (`FB_VIDEO_CHUNK_RETRIES`)
  - `backend/.env.example`, `backend/.env.production.example`
  - `backend/src/modules/manual-post/manual-post.repository.ts` (`findBlockingJob`)
    + `manual-post.service.ts` (guard 409 chặn tạo job trùng)
  - `backend/src/modules/auto-post/content-picker.repository.ts` (loại `FAILED`
    khỏi diện re-pick, cả `pickForSlot` lẫn `countByCategoryForPage`)
- **Khác thiết kế ban đầu:** §4b phát sinh sau khi user test tay (xem lý do ở
  §4b) — không có trong thiết kế §3 ban đầu.
- **Test:** 9 test `facebook-publisher.client.spec.ts` (resumable upload) + 1
  test byte-exact toàn vẹn video + 2 test `manual-post.service.spec.ts` (chặn
  job trùng FAILED/PUBLISHING) + 1 test `content-picker.repository.spec.ts`
  (`countByCategoryForPage` khớp picker, cả 2 câu đều loại `FAILED`). **710
  test BE xanh**, lint/build xanh.
- **Còn nợ:**
  - Test tay VPS thật với video ≥180MB (đăng thủ công **và** auto-post, kèm
    thử bấm "Đăng bài thủ công" 2 lần liên tiếp để xác nhận 409) — chưa làm,
    cần token/page thật trên VPS production. Xem `contexts.md` §6 mục 22.
  - Resume-sau-crash (giữ `upload_session_id` để tiếp tục job dở khi process
    crash giữa chừng) — không làm ở MVP, ghi nợ.
  - `docs/03-database-design.md:381` lệch code (thiếu `FAILED`) — không tự sửa
    `docs/`, cần user xác nhận. Xem `contexts.md` §6 mục 27.
