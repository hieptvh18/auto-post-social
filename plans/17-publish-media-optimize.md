# Plan 17 — Tối ưu đường publish media (cache Drive + stream, bỏ buffer RAM)

**Milestone:** sau M10 — nợ kỹ thuật phát sinh khi nâng `MAX_UPLOAD_MB` lên 300
**Trạng thái:** ✅ xong
**Phụ thuộc:** Plan 07 (auto-post engine), Plan 09 (đăng tay) — đã xong
**Spec tham chiếu:** `docs/08-queue-jobs.md` §1, §5

---

## 1. Mục tiêu

Đăng cùng một video lên nhiều page mà **không** nạp file vào RAM và **không** tải
lại file đó từ Drive cho từng page.

Số đo hiện trạng (đo thật bằng `process.memoryUsage().rss`, video 300MB):

| Bước | RSS |
|------|-----|
| base | 44 MB |
| sau `collectStream` → `Buffer.concat` | 634 MB |
| sau `new Uint8Array(buffer)` + `new Blob([...])` | **1020 MB** |

Ba bản copy của cùng một file. Với `fs.openAsBlob` (đã thử nghiệm) RSS giữ phẳng
189 → 200 MB kể cả khi stream hết 300MB đi.

Mục tiêu sau feature:

- 1 video × 4 page ⇒ tải Drive **1 lần**, RAM đỉnh **< 100MB** thay vì ~1GB.
- Video lớn không còn chết vòng lặp timeout → retry → tải lại.

## 2. Ngoài phạm vi

- **Facebook resumable/chunked upload** cho video lớn — việc lớn, tách plan 18.
- Nâng `concurrency` của worker: giữ **1**. Nâng lên chỉ có nghĩa sau khi RAM
  phẳng, và cần đo lại rate limit của Meta trước. Ghi vào §6 `contexts.md`.
- Tách queue riêng cho ảnh/video. Ghi nợ, không làm ở đây.
- Không đụng `memoryStorage` của đường **upload** (`media.controller.ts`) — đó là
  chiều ngược lại, nợ riêng.

## 3. Thiết kế

### 3.1 `MediaCacheService` (`src/infra/media-cache/`)

Tải file Drive xuống **đĩa** một lần, cho nhiều job dùng chung.

```ts
withLocalFile<T>(driveFileId: string, fn: (file: LocalMediaFile) => Promise<T>): Promise<T>
// LocalMediaFile = { path: string; size: number }
```

- Đường dẫn: `<cacheDir>/<driveFileId>` (`MEDIA_CACHE_DIR`, mặc định `os.tmpdir()/tool-auto-fb-media`).
- **Ref-count**: mỗi `withLocalFile` +1 khi vào, −1 khi ra. Chỉ xoá file khi
  ref = 0 **và** đã quá `MEDIA_CACHE_TTL_MS`. 4 job của 4 page chạy tuần tự vẫn
  dùng lại được file vì TTL chưa hết.
- **Chống tải trùng**: hai job cùng `driveFileId` gọi đồng thời ⇒ cùng chờ một
  promise tải (in-flight map), không tải 2 lần.
- Tải qua `storage.createReadStream()` → `pipeline` → file tạm `.part` → `rename`.
  Ghi thẳng vào tên đích rồi crash giữa chừng sẽ để lại file cụt bị dùng nhầm.
- Tải hỏng ⇒ xoá file dở, ném lỗi domain.

### 3.2 Publisher nhận **đường dẫn**, không nhận Buffer

`PublishFileInput`: `{ buffer: Buffer }` → `{ path: string; filename; mimeType }`.

`facebook-publisher.client.ts` dùng `await openAsBlob(path, { type: mimeType })`
thay cho `new Blob([new Uint8Array(buffer)])`. undici stream thẳng từ đĩa.

### 3.3 Timeout upload FB theo env

`IMAGE_TIMEOUT_MS`/`VIDEO_TIMEOUT_MS` hardcode → `FB_IMAGE_TIMEOUT_MS` (60_000),
`FB_VIDEO_TIMEOUT_MS` (900_000). 180s cũ đòi ≥14 Mbps liên tục mới đẩy nổi 300MB.

### 3.4 Dọn job hỏng trong Redis

`removeOnFail: false` → `{ age: 7 * 24 * 3600 }`. Redis dùng chung với dự án khác,
để job hỏng nằm vĩnh viễn là rò rỉ không giới hạn.

## 4. Task

- [x] `MediaCacheService` + module + đăng ký DI
- [x] Đổi `PublishFileInput` sang `path`, sửa `facebook-publisher.client.ts` dùng `openAsBlob`
- [x] `PublishMediaService.publish` bọc trong `withLocalFile`
- [x] Env: `MEDIA_CACHE_DIR`, `MEDIA_CACHE_TTL_MS`, `FB_IMAGE_TIMEOUT_MS`, `FB_VIDEO_TIMEOUT_MS`
- [x] `removeOnFail: { age: 7 ngày }`
- [x] Test `MediaCacheService`: tải 1 lần dùng nhiều lần · gọi song song không tải trùng · ref-count giữ file · TTL hết thì xoá · tải hỏng không để lại file cụt
- [x] Test scheduler: 4 page cùng mốc giờ ⇒ 4 job, đúng page, không nhầm content
- [x] Test `PublishMediaService`: cùng `driveFileId` 4 lần chỉ `createReadStream` 1 lần
- [x] `npm run lint && npm run build` xanh, `npm run test` xanh
- [x] Cập nhật `.env.example` + `.env.production.example`
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] 1 video × 4 page: `createReadStream` được gọi **đúng 1 lần**
- [x] Publisher nhận `path`, không còn `Buffer` nào của file media trong RAM
- [x] Timeout video đọc từ env, mặc định 900s
- [x] Job hỏng có hạn sống trong Redis
- [x] Toàn bộ test cũ vẫn xanh (không phá đường đăng tay)

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| File tạm đầy đĩa VPS | TTL + xoá khi ref=0; dọn thư mục cache lúc khởi động |
| Hai job cùng file, một job xoá khi job kia đang đọc | Ref-count, chỉ xoá khi ref=0 |
| Crash giữa lúc tải ⇒ file cụt bị dùng lần sau | Ghi `.part` rồi `rename` (atomic) |
| `openAsBlob` chưa ổn định | Đã có từ Node 19, VPS chạy Node 22 — kiểm bằng test thật |
| Đổi interface làm hỏng đăng tay | Đăng tay dùng chung `PublishMediaService`, test cũ phải xanh |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-03
- **File chính:**
  - `backend/src/infra/media-cache/media-cache.service.ts` (mới) + `media-cache.module.ts`
  - `backend/src/infra/facebook/facebook-publisher.client.ts` — `openAsBlob`, timeout theo env
  - `backend/src/infra/facebook/facebook-publisher.interface.ts` — `PublishFileInput.buffer` → `path`
  - `backend/src/modules/publish-jobs/publish-media.service.ts` — bọc `withLocalFile`
  - `backend/src/modules/publish-jobs/publish-queue.constants.ts` — `FAILED_JOB_RETENTION_SECONDS`
  - `backend/src/config/env.validation.ts`, `app-config.service.ts`
- **Khác thiết kế ban đầu:**
  1. **Bỏ `setTimeout` cho eviction, đổi sang `@Cron` 10 phút + `sweep(now)`.** Thiết kế
     đầu dùng `setTimeout` hẹn giờ xoá; viết test mới thấy không quan sát được xác
     định (fake timer không chờ được thao tác `fs` thật bên trong callback). Mẫu
     `@Cron` + `ClockService` + hàm nhận `now` giống `AutoPostSchedulerService.tick`
     vừa test được bằng giờ giả, vừa không để timer treo.
  2. Thêm `emptyToDefaultDir` trong `env.validation.ts`: `MEDIA_CACHE_DIR=` để rỗng
     (đúng như `.env.example` ship ra) sẽ rơi vào `@IsNotEmpty()` và **crash app lúc
     boot**. Transform phải trả thẳng giá trị mặc định — trả `undefined` vẫn bị
     `exposeDefaultValues` ghi đè lên default của class.
- **Test:** 641 → 641 pass (48 suite). Thêm 21 test `MediaCacheService`
  (coverage 100%), 13 test `PublishMediaService`, 6 test kịch bản 4 page cùng mốc
  giờ ở `AutoPostSchedulerService`, 3 test env.
- **Còn nợ:**
  - Facebook resumable/chunked upload cho video lớn — chưa làm, cần plan riêng.
  - `concurrency` worker vẫn = 1; RAM đã phẳng nên nâng được, nhưng phải đo rate
    limit của Meta trước.
  - Chưa tách queue riêng cho ảnh/video (video nặng vẫn chặn ảnh nhẹ).
  - Chưa test tay trên VPS thật với video 300MB × 4 page.
