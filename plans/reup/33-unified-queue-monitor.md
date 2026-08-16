# Plan 33 — Gộp cả 4 queue vào Queue Monitor / Failed Jobs

**Milestone:** M12 (nợ kỹ thuật phát hiện khi làm reup) · **Trạng thái:** ⬜ chưa làm
**Phụ thuộc:** [29-reup-cron-pipeline.md](./29-reup-cron-pipeline.md) **đã xong**
(cần có queue `reup-download` thật thì mới có cái để gộp)
**Spec tham chiếu:** không có — plan này là spec tạm
**Bản đồ:** [README.md](./README.md)

---

## 1. Mục tiêu

Phát hiện khi user hỏi *"phần reup này có vẻ không đẩy vào Queue Monitor hay Failed Job
nhỉ?"* (2026-08-16): `MonitorService`/`FailedJobsPage` **chỉ** đọc queue `publish-facebook`
+ bảng `publish_jobs`. Ba queue còn lại của hệ thống — `media-upload` (plan 23),
`media-drive-import` (plan 24), `reup-download` (plan 29) — **hoàn toàn vô hình** với 2
màn giám sát chung. Đây là nợ có sẵn **từ trước reup**, plan 29 chỉ làm nó lộ rõ hơn vì
thêm queue thứ 4.

Sau plan này: `/queue` và `/failed` cho thấy đủ **cả 4 queue**, người vận hành không cần
biết `/reup` tồn tại mới phát hiện video đang kẹt hay tải hỏng.

## 2. Ngoài phạm vi

- **Không** làm lại UI Monitor từ đầu — mở rộng đúng cấu trúc đang có (tabs), không đổi
  luồng của tab `publish-facebook` hiện tại (không được có test cũ nào đỏ).
- **Không** thêm khả năng pause/resume/drain/xoá job từ UI Monitor — màn này giữ nguyên
  tính chất **chỉ đọc** (rule đã ghi ở `monitor.service.ts` — sửa nhầm ở đây là đăng
  trùng lên page thật, hoặc ở đây là tải trùng/xoá nhầm file reup).
- **Không** đổi cơ chế "Đăng lại" hiện có của `publish_jobs`. Retry cho `media_upload_jobs`
  đã có sẵn `POST /media/upload-jobs/:id/retry`; retry cho `reup_videos` đã có sẵn
  `POST /reup/videos/:id/retry` (plan 29) — chỉ **hiển thị** ở đây, dùng lại nút bấm cũ,
  không viết logic retry thứ hai.
- **Không** gộp *dữ liệu* 4 loại job thành 1 bảng chung — mỗi loại có ngữ nghĩa khác nhau
  (job đăng bài khác hẳn job tải video). Gộp ở tầng **hiển thị** (tabs), không gộp schema.

## 3. Thiết kế

### 3.1 Vì sao tách được — không cần sửa gì ở 4 module gốc

Bốn nguồn dữ liệu đã tồn tại đầy đủ, chỉ chưa có nơi **gom lại**:

| Nguồn | Đọc counts | Đọc job đang chạy/kẹt | Đọc job FAILED |
|---|---|---|---|
| `publish-facebook` | `MonitorService.readQueueCounts()` | `publish_jobs` status QUEUED/PUBLISHING | `publish_jobs` status FAILED |
| `media-upload` | `Queue.getJobCounts()` (chưa dùng) | `media_upload_jobs` status QUEUED/UPLOADING_TO_DRIVE | `media_upload_jobs` status FAILED |
| `media-drive-import` | như trên | `media_upload_jobs` status COPYING_FROM_DRIVE | như trên (cùng bảng, khác `source`) |
| `reup-download` | như trên | `reup_videos` status DOWNLOADING/UPLOADING | `reup_videos` status FAILED |

⇒ Việc cần làm là thêm **repository method đọc** ở 2 module còn thiếu
(`media-upload-jobs`, `reup`), rồi viết **1 service tổng hợp mới** gọi cả 4 nguồn song
song. Không sửa nghiệp vụ tạo/retry/xoá của module nào.

### 3.2 Backend — service tổng hợp mới, không sửa `MonitorService` cũ

```text
src/modules/monitor/
├── monitor.service.ts            ← GIỮ NGUYÊN, vẫn phục vụ GET /monitor/queue/summary
├── unified-queue.service.ts      ← MỚI — gộp 4 nguồn
├── unified-queue.types.ts        ← MỚI
```

```ts
export type QueueSource = 'PUBLISH' | 'MEDIA_UPLOAD' | 'DRIVE_IMPORT' | 'REUP_DOWNLOAD';

interface QueueSourceSummary {
  source: QueueSource;
  label: string;                  // "Đăng bài Facebook" / "Upload media" / ...
  queue: QueueCounts | null;       // null = Redis không đọc được nguồn này
  queueError: string | null;
  failedCount: number;             // đếm DB, không phải BullMQ 'failed'
                                    // (job hết lượt retry mới tính — khớp cách
                                    // publish_jobs/media_upload_jobs/reup_videos
                                    // đóng sổ FAILED hiện tại)
}

interface UnifiedQueueSummary {
  sources: QueueSourceSummary[];
  checkedAt: Date;
}
```

`UnifiedQueueService.getSummary()` gọi `Promise.all` trên 4 nguồn, mỗi nguồn **tự bọc
try/catch** (đúng khuôn `readQueueCounts()` hiện có) — 1 queue Redis chết không được kéo
sập cả màn hình.

**Repository method cần thêm** (đọc-thuần, không sửa method có sẵn):
- `MediaUploadJobsRepository.countByStatusAndSource(source)` — dùng lại cột `source` có
  sẵn để tách `media-upload` khỏi `media-drive-import` dù chung 1 bảng.
- `ReupVideosRepository.countByStatus()`.

### 3.3 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `GET` | `/monitor/queue/unified` | `queue:view` | 4 nguồn, endpoint **mới**, không đổi `/monitor/queue/summary` cũ |

Giữ nguyên `queue:view` — không tạo permission mới. Đây vẫn là màn Monitor cũ, chỉ nhìn
được rộng hơn. **Không** ẩn theo `reup:view`: một job media-upload/drive-import kẹt là
chuyện ADMIN cần biết, không phải bí mật của SUPER_ADMIN. Riêng nhánh `REUP_DOWNLOAD` khi
trả về **không kèm tiêu đề video/tên chủ đề** cho actor thiếu `reup:view` — chỉ đếm số,
không lộ nội dung (cùng tinh thần chặn rò rỉ đã làm ở plan 27 §3.2, tránh ADMIN suy ra sự
tồn tại của tính năng reup từ dữ liệu chi tiết dù không thấy được menu).

### 3.4 Frontend — chuyển `/queue` sang dạng Tabs, giữ nguyên tab đầu

```text
QueueMonitorPage.tsx
  Tabs:
    "Đăng bài Facebook"   ← nội dung HIỆN TẠI, giữ nguyên 100% (không refactor)
    "Upload media"        ← mới: bảng job media_upload_jobs QUEUED/UPLOADING_TO_DRIVE
    "Nhập từ Drive"       ← mới: cùng bảng, lọc source=DRIVE_LINK
    "Reup"                ← mới: bảng reup_videos DOWNLOADING/UPLOADING, ẩn nếu !reup:view
```

Mỗi tab header hiện badge đỏ số lượng FAILED (dùng `Badge count`) — người vận hành lướt
qua là biết ngay tab nào cần xem, không phải click từng tab.

`FailedJobsPage.tsx` áp cùng khuôn Tabs, mỗi tab dùng lại đúng API/hook đã có sẵn của
module đó (`useFailedJobs` giữ nguyên cho tab đầu; 2 hook mới `useFailedMediaUploadJobs`/
`useFailedReupVideos` chỉ là `useMediaUploadJobs({status:'FAILED'})`/
`useReupVideos({status:'FAILED'})` đã tồn tại — không viết API mới cho tầng đọc).

**Nút "Đăng lại"/"Thử lại" trên mỗi tab gọi đúng mutation đã có** của module đó
(`useRetryPublishJob` / `useRetryMediaUploadJob` / `useRetryReupVideo`) — không viết
logic retry mới, chỉ đặt đúng nút vào đúng bảng.

## 4. Task

**Backend**
- [ ] `MediaUploadJobsRepository.countByStatusAndSource()` + `.findActiveBySource()`
- [ ] `ReupVideosRepository.countByStatus()` + `.findActive()` (đã có `findMany`, thêm
      hàm gọn cho case không cần phân trang)
- [ ] `unified-queue.types.ts` + `unified-queue.service.ts` (mỗi nguồn tự bọc lỗi)
- [ ] `MonitorController`: thêm `GET /monitor/queue/unified`
- [ ] Nhánh REUP_DOWNLOAD ẩn chi tiết (chỉ số đếm) khi actor thiếu `reup:view`

**Frontend**
- [ ] `api/monitor.api.ts`: thêm `getUnifiedSummary()`
- [ ] `hooks/useMonitor.ts`: thêm `useUnifiedQueueSummary()`
- [ ] `QueueMonitorPage.tsx`: bọc nội dung hiện tại vào `Tabs`, thêm 3 tab mới + badge
      FAILED trên header tab
- [ ] `FailedJobsPage.tsx`: tương tự, dùng lại hook/mutation đã có của từng module
- [ ] Mọi mutation retry đã `invalidateQueries` đúng key của module đó — kiểm tra lại
      không đứt khi đặt trong Tabs mới

**Test bắt buộc** (đọc-thuần nhiều nguồn, 1 nguồn chết không được sập cả màn — rule 02)
- [ ] `unified-queue.service`: 1 trong 4 nguồn ném lỗi Redis ⇒ 3 nguồn còn lại **vẫn** trả
      số liệu, nguồn lỗi trả `queue: null` kèm `queueError`
- [ ] `countByStatusAndSource`: tách đúng `media-upload` khỏi `media-drive-import` dù
      chung bảng `media_upload_jobs`
- [ ] Actor thiếu `reup:view` gọi `/monitor/queue/unified` ⇒ nhánh REUP_DOWNLOAD **có**
      trong response nhưng **không** có field chi tiết (chỉ số đếm)
- [ ] RBAC: actor thiếu `queue:view` ⇒ 403 (giữ nguyên hành vi cũ)

**Chốt**
- [ ] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh
- [ ] Test cũ của `MonitorService`/`FailedJobsPage` **không đổi và vẫn xanh** (không
      refactor tab đầu)
- [ ] `.env.example`: không đổi
- [ ] `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

- [ ] Tạo 1 video reup lỗi (sai URL) ⇒ vào `/queue` tab "Reup" thấy nó **đang chạy/kẹt**;
      hết lượt retry ⇒ vào `/failed` tab "Reup" thấy nó, bấm "Thử lại" chạy lại được
- [ ] Upload tay 1 file rồi ngắt mạng giữa chừng (job kẹt UPLOADING_TO_DRIVE) ⇒ thấy ở
      `/queue` tab "Upload media"
- [ ] Tắt Redis ⇒ cả 4 tab đều hiện "không đọc được", **không** làm tab publish (đang có
      dữ liệu DB) trắng theo
- [ ] ADMIN (không có `reup:view`) vào `/queue` ⇒ **không thấy tab Reup** ở FE, nhưng gọi
      thẳng API vẫn thấy đủ 4 nhóm số liệu (không phải 403) — dùng để phát hiện sớm nếu
      job reup kẹt hàng loạt mà không cần biết `/reup` tồn tại
- [ ] Test cũ `monitor.service.spec.ts` (tab publish) **không đổi, vẫn xanh 100%**

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Đọc 4 queue Redis cùng lúc chậm hơn 1 queue, màn Monitor load lâu | Mỗi nguồn có timeout riêng 2s (đã có ở nguồn cũ), `Promise.all` chạy song song không phải tuần tự |
| R2 | Sửa nhầm `MonitorService` cũ trong lúc thêm code mới, làm tab publish hỏng | Viết **service mới hoàn toàn** (`UnifiedQueueService`), không sửa 1 dòng của `MonitorService` |
| R3 | Badge FAILED tính sai vì nhầm `BullMQ failed` (job đang chờ Bull tự retry) với `FAILED` thật trong DB (hết lượt) | Đếm theo **DB status**, không đọc `queue.getJobCounts('failed')` cho badge — đúng khuôn plan 07/23/29 đã chọn (job hỏng còn lượt retry vẫn ở QUEUED/PENDING trong DB) |
| R4 | Lộ nội dung reup (tiêu đề video) cho ADMIN qua endpoint unified dù menu đã ẩn | Nhánh REUP_DOWNLOAD chỉ trả số đếm khi thiếu `reup:view`, test riêng cho case này |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:** N test
- **Còn nợ:**
