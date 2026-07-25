# Plan 07 — Auto-Post Engine (cron picker + BullMQ + publisher + log DB)

**Milestone:** M6 — **trọng tâm của MVP**
**Trạng thái:** 🟡 code + test + smoke API xong 2026-07-25, chờ Page token để đăng thật
**Phụ thuộc:** Plan 04 (content), Plan 06 (slots), Plan 09 (publisher client), Plan 12 (màn lịch)
**Spec:** `docs/02-architecture.md` §5.3 §5.4 §6, `docs/03-database-design.md` §7,
`docs/07-facebook-publisher.md`, `docs/08-bullmq.md`
**Chốt với user 2026-07-25:** log chi tiết vào DB (mở rộng `slot_runs` + bảng mới
`publish_job_events`); **chỉ làm API, chưa làm màn hình "Nhật ký Bot"** — trang
`/timeline` (plan 12) là nơi quan sát.

---

## 1. Mục tiêu

Đến mốc giờ của slot, Bot tự chọn đúng bài đã duyệt theo category/media, tạo publish
job, tải file từ Drive lên Facebook Page, cập nhật kết quả về DB. **Không đăng lặp,
không bỏ sót, không double-fire.** Mọi lần cron chạm một slot và mọi lần thử đăng đều
để lại dấu vết trong DB để truy nguyên khi có sự cố.

## 2. Ngoài phạm vi

Màn hình "Nhật ký Bot", retry/cancel qua UI, DLQ dashboard, reconciliation cron,
multi-worker leader election, resumable upload cho video lớn. BullMQ vẫn cấu hình
retry 3 + backoff mũ, chỉ chưa có màn hình quản trị.

---

## 3. Những gì đã có sẵn (không làm lại)

| Có sẵn | Dùng vào việc gì |
|--------|------------------|
| `src/infra/clock/clock.service.ts` | `now()` — inject để test không phụ thuộc giờ thật |
| `src/infra/redis/redis.service.ts` | `getClient()` cho `BullModule` (đã set `maxRetriesPerRequest: null`) |
| `src/infra/facebook/facebook-publisher.client.ts` | `publishImage`/`publishVideo` — **đã dùng thật ở đăng tay** (plan 09) |
| `src/infra/drive/drive-storage.factory.ts` | `createReadStream(driveFileId)` |
| `AutoPostConfigsRepository.findDueSlots(hhmm)` | lấy slot đến giờ (đã lọc slot tắt / page tạm dừng / page tắt auto / page đã xoá) |
| `FacebookPagesService.getDecryptedToken(pageId)` | lối vào duy nhất lấy token plaintext |
| `common/utils/datetime.util.ts` | quy đổi ngày/giờ VN ↔ UTC (plan 12) |
| `ManualPostService` | mẫu tham chiếu cho luồng publish (**không** gọi lại — engine có luồng riêng, có queue) |
| Bảng `slot_runs`, `publish_jobs` | có từ M0, migration cũ giữ nguyên |
| Env `AUTOPOST_ENABLED`, `META_*` | đã có trong `.env.example` + `env.validation.ts` |
| Package `@nestjs/schedule`, `@nestjs/bullmq`, `bullmq` | đã cài, **chưa wire vào `app.module.ts`** |

Việc **rút phần publish dùng chung** giữa `ManualPostService` và processor: xem §8
(quyết định: tách `PublishExecutor` dùng chung, manual-post refactor gọi lại).

---

## 4. Thiết kế

### 4.1 Tách trách nhiệm

```text
AutoPostSchedulerService   @Cron('* * * * *', tz Asia/Ho_Chi_Minh), tắt khi AUTOPOST_ENABLED=false
  └─ tick(now)             : findDueSlots('HH:mm') → mỗi slot gọi runSlot (tuần tự, lỗi 1 slot không chết cả tick)
  └─ runSlot(slot, now)    : claim → pick → tạo job + enqueue → đóng sổ slot_run

SlotRunService             : claim(slotId, runDate, runTime) → SlotRun | null  (INSERT, bắt P2002 ⇒ null)
                             finish(slotRunId, {status, pickedCount, jobCreatedCount, skipReason, errorMessage})

ContentPickerService       : pickForSlot(slot) → ContentAsset[]     ← hàm quan trọng nhất
PublishJobsService         : createQueuedJob(content, slot) + enqueue BullMQ, lưu bullJobId
PublishExecutor            : execute(publishJobId) — luồng đăng thật, idempotent (§4.5)
PublishFacebookProcessor   : @Processor('publish-facebook') → gọi PublishExecutor
PublishJobEventsService    : log(jobId, attemptNo, event, message?, rawError?)  ← nhật ký từng lần thử
```

### 4.2 Picker query — bám đúng `docs/03` §7

```sql
SELECT c.* FROM content_assets c
JOIN content_page_assignments a
  ON a.content_asset_id = c.id
 AND a.facebook_page_id = $pageId
 AND a.published_at IS NULL
WHERE c.status IN ('APPROVED','PUBLISHING','PUBLISHED')
  AND c.category = ANY($categories)
  AND ($slotMediaType = 'all' OR c.media_type = $slotMediaType)
  AND NOT EXISTS (
    SELECT 1 FROM publish_jobs j
    WHERE j.content_asset_id = c.id AND j.facebook_page_id = $pageId
      AND j.status IN ('QUEUED','PUBLISHING'))
ORDER BY c.updated_at ASC
LIMIT $postCount;
```

`PUBLISHED`/`PUBLISHING` vẫn hợp lệ vì bài đã đăng ở page A phải đăng được ở page B —
điều kiện chặn trùng nằm ở `assignment.published_at IS NULL` (UNIQUE content × page).

Viết bằng `$queryRaw` **trong repository** (Prisma không diễn tả nổi `NOT EXISTS` +
`ANY` gọn), trả về plain object đã map, không rò Prisma type ra service.

### 4.3 Log DB — hai tầng (yêu cầu user)

**Tầng 1 — `slot_runs` mở rộng: "cron đã chạm slot này lúc nào, ra kết quả gì".**
Bảng đã tồn tại và đang giữ UNIQUE `(slot_id, run_date, run_time)` chống double-fire
(ADR-006) — nay bổ sung cột kết quả, **không đổi khoá unique**:

| Cột mới | Kiểu | Ý nghĩa |
|---------|------|---------|
| `status` | enum `SlotRunStatus` | `CLAIMED` → `DONE` \| `SKIPPED` \| `ERROR` |
| `picked_count` | int, default 0 | picker chọn ra bao nhiêu bài |
| `job_created_count` | int, default 0 | thực tế tạo được bao nhiêu publish job |
| `skip_reason` | text? | `NO_CONTENT` \| `PAGE_PAUSED` \| `TOKEN_MISSING` \| `SLOT_DISABLED` |
| `started_at` | timestamp, default now | lúc claim |
| `finished_at` | timestamp? | lúc đóng sổ |
| `error_message` | text? | lỗi làm cả slot-run hỏng |

Trả lời được câu hỏi hay gặp nhất: *"tới giờ mà không có bài nào lên page — vì sao?"*
(hết bài? page bị tạm dừng? cron không chạy? — không có dòng nào tức là cron không chạy).

**Tầng 2 — bảng mới `publish_job_events`: "một job đã thử mấy lần, hỏng ở đâu".**

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | uuid PK | |
| `publish_job_id` | uuid FK → `publish_jobs.id`, ON DELETE CASCADE | |
| `attempt_no` | int | 1..3, đúng `job.attemptsMade + 1` của BullMQ |
| `event` | enum `PublishJobEvent` | `ENQUEUED` \| `STARTED` \| `SUCCEEDED` \| `FAILED` \| `RETRY_SCHEDULED` \| `GAVE_UP` |
| `message` | text? | message tiếng Việt đã map (`facebook.errors.ts`) |
| `raw_error` | jsonb? | response gốc Graph/Drive để điều tra — **đi qua hàm lọc, không chứa token** |
| `created_at` | timestamp default now | |

Index: `(publish_job_id, created_at)`.

Ghi event **không được làm hỏng nghiệp vụ chính** — nuốt lỗi + log, đúng cách
`AuditService.log()` đang làm.

**Audit log** vẫn ghi 1 dòng mỗi lần đăng thành công: `AUTO_PUBLISH`, `userId = null`
(actor = Bot). Đây là dấu vết nghiệp vụ, khác nhật ký kỹ thuật ở trên.

### 4.4 Luồng `runSlot`

```text
1. claim(slot.id, runDate 'YYYY-MM-DD' (VN), runTime 'HH:mm') → null ⇒ return (đã chạy rồi)
2. pickForSlot(slot) → contents
3. contents rỗng ⇒ finish(SKIPPED, skipReason=NO_CONTENT) + log warn ⇒ return
4. với mỗi content: createQueuedJob + enqueue + event ENQUEUED
   (job tạo lỗi ⇒ ghi errorMessage, tiếp bài kế, không văng cả slot)
5. finish(DONE, pickedCount, jobCreatedCount)
6. Ngoại lệ bất kỳ ⇒ finish(ERROR, errorMessage) rồi nuốt (tick còn slot khác phải chạy)
```

`content → PUBLISHING` **không** set ở bước tạo job — để nguyên `APPROVED` cho tới khi
worker thật sự bắt đầu đăng (§4.5 bước 2). Bài chờ trong queue vẫn không bị chọn lại vì
picker đã loại content có job `QUEUED`.

### 4.5 Luồng worker (`PublishExecutor.execute`)

```text
1. Load job + content + page. job.status != QUEUED ⇒ return (idempotent, BullMQ giao 2 lần vẫn an toàn)
2. Transaction: job → PUBLISHING, content → PUBLISHING; event STARTED (attempt_no)
3. Lấy token (getDecryptedToken — page đã xoá/tạm dừng ⇒ ném lỗi domain)
4. Drive createReadStream(driveFileId) → publisher.publishImage|publishVideo
5. OK  : transaction {
           job → SUCCESS + facebook_post_id + published_at
           assignment(content, page).published_at = now, facebook_post_id
           content → PUBLISHED
         }
         event SUCCEEDED · audit AUTO_PUBLISH
6. Lỗi : job.attempt_count += 1, error_message
         còn attempt ⇒ job → QUEUED, event FAILED + RETRY_SCHEDULED, ném lại cho BullMQ backoff
         hết attempt ⇒ job → FAILED, event GAVE_UP,
                       content quay lại APPROVED nếu chưa page nào published (recompute từ assignments,
                       không set mù)
```

BullMQ: queue `publish-facebook`, `jobId: publish-<publishJobId>` (add idempotent),
`attempts: 3`, `backoff: exponential 60s`, `removeOnComplete: 100`, `removeOnFail: false`.

### 4.6 API đọc log (không có UI riêng)

- `GET /publish-jobs?date=&pageId=&status=` — danh sách job (`timeline:view`).
- `GET /publish-jobs/:id/events` — nhật ký từng lần thử của một job (`timeline:view`).
- `GET /publish-schedule` (plan 12) **bổ sung** `slotRun: { status, skipReason, pickedCount,
  jobCreatedCount, finishedAt } | null` cho mỗi dòng slot ⇒ UI hiện được lý do "hôm nay
  slot này không đăng gì". FE chỉ thêm hiển thị nhỏ, không thêm trang.

---

## 5. Task

### 5.1 Schema & ERD (làm trước, đúng rule 05)

- [x] `schema.prisma`: enum `SlotRunStatus`, enum `PublishJobEvent`, mở rộng model
      `SlotRun` (7 cột §4.3), model mới `PublishJobEvent` + quan hệ từ `PublishJob`
- [x] **Cập nhật `erd.md`** — bảng mới, cột mới, 2 enum mới, index mới, ghi chú ràng buộc
      (UNIQUE `slot_runs` vẫn là khoá chống double-fire), dòng Lịch sử thay đổi
- [x] `npx prisma migrate dev --name autopost_engine_logs` + `npm run prisma:generate`
      (bắt buộc, nếu không `tsc` đỏ trong khi jest xanh — §7 cạm bẫy)

### 5.2 Engine

- [x] `SlotRunRepository` + `SlotRunService`: `claim` (bắt P2002 ⇒ null), `finish`
- [x] `ContentPickerRepository.pickForSlot` (`$queryRaw` theo §4.2) + `ContentPickerService`
- [x] `PublishJobEventsRepository/Service.log()` — nuốt lỗi, lọc token khỏi `rawError`
- [x] `PublishJobsService.createQueuedJob` + `enqueue` (lưu `bullJobId`)
- [x] `AutoPostSchedulerService.tick/runSlot` + `@Cron('* * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })`,
      no-op khi `AUTOPOST_ENABLED=false`
- [x] `PublishExecutor.execute` theo §4.5 (transaction + recompute content status)
- [x] `PublishFacebookProcessor` (`@Processor('publish-facebook')` + `@OnWorkerEvent('failed')`)
- [x] Wire `ScheduleModule.forRoot()` + `BullModule.forRootAsync` (connection từ `RedisService`)
      + `registerQueue('publish-facebook')` vào `app.module.ts`
- [x] Audit action mới `AUTO_PUBLISH` (userId null)
- [x] Refactor `ManualPostService` gọi `PublishExecutor` (§8) — giữ nguyên hành vi API,
      test cũ của plan 09 phải xanh không sửa assertion
- [x] `GET /publish-jobs`, `GET /publish-jobs/:id/events`; `publish-schedule` trả thêm `slotRun`

### 5.3 Test — **BẮT BUỘC phủ kỹ** (rule 02 §Bắt buộc phải phủ)

Đây là logic dễ sai nhất sản phẩm: picker sai ⇒ đăng lặp/thiếu, double-fire ⇒ spam page thật.

- [x] picker: đúng category · `mediaType=all` và cụ thể · loại assignment đã published ·
      loại content đã có job QUEUED/PUBLISHING · thứ tự `updated_at ASC` · tôn trọng
      `postCount` · hết bài ⇒ rỗng
- [x] `tick` chạy 2 lần cùng slot/phút ⇒ **chỉ tạo job một lần** (claim thứ 2 trả null)
- [x] scheduler: `AUTOPOST_ENABLED=false` ⇒ không làm gì · lỗi ở slot A không chặn slot B
- [x] `slot_runs`: hết bài ⇒ `SKIPPED/NO_CONTENT` · thành công ⇒ `DONE` + đúng 2 count ·
      ngoại lệ ⇒ `ERROR` + `error_message`
- [x] executor: thành công ảnh · thành công video · job không còn QUEUED ⇒ **không gọi FB** ·
      lỗi FB còn attempt ⇒ QUEUED + event `RETRY_SCHEDULED` + ném lại · hết attempt ⇒
      FAILED + `GAVE_UP` + content về APPROVED · 1/2 page xong ⇒ content PUBLISHED
- [x] `publish_job_events`: đúng `attempt_no` tăng dần · `raw_error` **không chứa token**
- [x] `npm run lint && npm run test:cov && npm run build` xanh (coverage vùng auto-post)

### 5.4 Frontend (nhỏ — trang lịch đã có từ plan 12)

- [x] `TimelinePage`: hiện `slotRun.skipReason` (vd "Hết bài phù hợp") trên dòng slot
- [x] Job FAILED: nút xem nhật ký (`GET /publish-jobs/:id/events`) trong Drawer/Modal
- [x] `npm run lint && npm run build` (frontend) xanh

### 5.5 Đóng sổ

- [x] Cập nhật `contexts.md` (§4 milestone M6, §5 nhật ký, §6 nợ còn lại)
- [x] `git mv plans/07-autopost-engine.md plans/DONE/` khi nghiệm thu §6 xong

---

## 6. Điều kiện nghiệm thu (chạy thật)

Đã chạy thật 2026-07-25 với **page test token sai** (cố ý không đăng lên page thật):

- [x] Slot đúng phút hiện tại, `postCount=2`, 1 bài APPROVED đã gán vào page test
- [x] `POST /auto-post/run-now` ⇒ `pickedCount=1`, `jobCreatedCount=1`
- [x] `slot_runs` đúng **1 dòng**, `status=DONE`, `job_created_count=1`
- [x] **Double-fire**: gọi tick lần 2 cùng phút ⇒ `claimed=false`, không tạo thêm job
- [x] Bài đang có job QUEUED ⇒ tick phút sau `SKIPPED` / `skip_reason=NO_CONTENT`
- [x] Token sai ⇒ 3 lần thử (backoff 60s mũ), event
      `ENQUEUED → STARTED → FAILED → RETRY_SCHEDULED → … → GAVE_UP`, job `FAILED`,
      `attempt_count=3`, content tự quay lại `APPROVED`
- [x] `raw_error` ghi được lỗi Graph, không chứa token
- [x] `GET /publish-schedule` trả `slotRun` đúng cho từng mốc giờ
- [x] Dữ liệu smoke đã xoá khỏi DB dev (page test, job, assignment, slot_runs)

Còn **chưa** nghiệm thu được (chặn bởi thiếu Page token thật — contexts §6 mục 10):

- [ ] Job SUCCESS thật: assignment có `published_at` + `facebook_post_id`, content `PUBLISHED`
- [ ] Đăng thật lên page Facebook staging (ảnh rồi tới video)
- [ ] Restart app đúng phút slot ⇒ không đăng trùng (mới chứng minh bằng tick 2 lần)
- [ ] Trên UI thật (`VITE_USE_MOCK=false`): mở `/timeline` xem job chuyển SUCCESS

**Chặn cứng:** cần Page token dùng được (contexts §6 mục 10 — system user chưa gán page).
Chưa có token thì engine chỉ nghiệm thu được tới bước tạo job, không đăng thật được.

---

## 7. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Cron double-fire khi restart trong cùng phút | `slot_runs` UNIQUE (ADR-006), claim bằng INSERT chứ không SELECT-rồi-INSERT — có test riêng |
| Cron chạy trong test/CI làm test giòn | `AUTOPOST_ENABLED=false` ở env test; scheduler kiểm cờ ngay đầu `tick` |
| Token FB hết hạn giữa chừng | job FAILED + message rõ từ `facebook.errors.ts`; `page.token_expire_at` cảnh báo trước |
| Video Drive lớn ⇒ OOM / timeout Graph | Hiện nạp cả buffer (kế thừa plan 09) — ghi nợ resumable upload; log kích thước file |
| `raw_error` lộ token vào DB | Hàm `sanitizeError` xoá `access_token`/`Authorization` trước khi ghi; **có test riêng** |
| Content status ghi đè sai khi nhiều page song song | Recompute từ assignments trong transaction, không set mù |
| Job "treo" ở PUBLISHING khi app chết giữa chừng | MVP chấp nhận, ghi nợ reconciliation cron (ngoài scope §2) |

---

## 8. Quyết định thiết kế cần ghi nhớ

1. **Tách `PublishExecutor` dùng chung cho manual + auto.** Plan 09 đã có luồng đăng
   hoàn chỉnh nằm trong `ManualPostService`; copy sang processor sẽ thành 2 bản logic
   publish trôi khỏi nhau (đúng loại lỗi đắt: sửa 1 chỗ quên chỗ kia). Điểm khác nhau
   chỉ là *ai gọi* (user đứng chờ vs worker) và *retry* — nên tách phần chung, giữ
   `ManualPostService` làm lớp mỏng validate + gọi executor đồng bộ.
2. **`slot_runs` vừa là khoá chống double-fire vừa là nhật ký.** Không tách bảng log
   riêng: cùng một hàng, `INSERT` để claim rồi `UPDATE` để đóng sổ — không thêm đường
   ghi thứ hai có thể lệch nhau.
3. **`publish_job_events` là nhật ký kỹ thuật, `audit_logs` là dấu vết nghiệp vụ.**
   Không nhồi retry/stacktrace vào audit log.
4. **Không set `content → PUBLISHING` lúc tạo job** (khác gợi ý ở `docs/08` §1b): job
   nằm trong queue chưa phải đang đăng, mà `PUBLISHING` hiển thị trên UI như đang chạy.
   Picker vẫn không chọn lại nhờ mệnh đề loại job `QUEUED`.
5. **Cron chạy mỗi phút, khớp `time` chính xác `HH:mm`** — không có cửa sổ dung sai.
   App chết đúng phút đó ⇒ slot bị lỡ (UI plan 12 hiện `MISSED`), không tự bù. Bù lỡ
   giờ là việc của reconciliation cron, ngoài scope MVP.

---

## 8b. Bổ sung 2026-07-25 — cảnh báo "hết bài" cho admin (yêu cầu user)

Tình huống thật: slot 22:00 của page "Hiep - Kaku Coach" chạy đúng giờ nhưng ra
`SKIPPED/NO_CONTENT` vì bài chưa được phân bổ vào page — nhìn UI **không biết vì sao**.
Bổ sung để admin tự chẩn đoán được, không phải mở DB:

- `ContentPickerRepository.countForSlot` (đúng điều kiện picker, bỏ LIMIT) +
  `countAssignedPending(pageId)` (bài đã gán page, chưa đăng, không lọc danh mục).
- Hàm thuần `slot-readiness.ts` → `READY` | `NO_ASSIGNMENT` | `NO_MATCH` | `PAUSED`
  kèm câu tiếng Việt nói **cách sửa**. Phân biệt được "chưa gán bài cho page" với
  "có bài chờ nhưng không khớp danh mục/loại media" — hai lỗi cấu hình khác hẳn nhau.
- `GET /auto-post-configs` trả thêm `readyCount`, `readiness`, `lastRun` cho mỗi slot.
- Tách `ContentPickerModule` + `SlotRunModule` để `AutoPostConfigsModule` dùng lại mà
  không tạo vòng phụ thuộc với `AutoPostModule`; `PublishScheduleModule` cũng chuyển
  sang `SlotRunModule` cho nhẹ.
- FE `/auto-post`: cột **"Kho bài"** (`N bài sẵn sàng` / `Chưa phân bổ bài` / `Không khớp
  danh mục`), cột **"Bot chạy hôm nay"** (`22:00 · bỏ qua (hết bài)`), banner cảnh báo
  gộp đầu mỗi page. FE `/timeline`: tag "Bot bỏ qua — không có bài" + `Alert` giải thích,
  và trường hợp `MISSED` mà **không có** dòng `slot_runs` ⇒ báo "Bot chưa từng chạy mốc này".
- Test: `slot-readiness` 7 case + service 5 case (tổng BE 464 test xanh).

## 9. Kết quả

- **Ngày xong:** 2026-07-25 (code + test + smoke API; chưa đăng thật lên Facebook)
- **File chính:**
  - `backend/src/modules/auto-post/` — `auto-post-scheduler.service.ts` (`@Cron` mỗi phút,
    `tick`/`runSlot`), `content-picker.repository.ts` (raw SQL), `slot-run.{repository,service}.ts`,
    `auto-post-engine.controller.ts` (`POST /auto-post/run-now`)
  - `backend/src/modules/publish-jobs/` — `publish-jobs.{repository,service}.ts`,
    `publish-executor.service.ts`, `publish-media.service.ts` (đường đăng dùng chung),
    `publish-job-events.{repository,service}.ts` (+ `sanitizeRawError`),
    `publish-facebook.processor.ts`, `publish-jobs.controller.ts`
  - `backend/prisma/schema.prisma` + `erd.md` (migration `20260725122007_autopost_engine_logs`)
  - `frontend/src/components/timeline/JobEventsModal.tsx`, `src/pages/TimelinePage.tsx`
- **Khác thiết kế ban đầu:**
  1. Phần dùng chung với đăng tay rút ra thành **`PublishMediaService`** (tải Drive + chọn
     ảnh/video + ghép caption) thay vì `PublishExecutor` bọc cả DB như §8.1 dự tính —
     `ManualPostService` giữ nguyên luồng đồng bộ của nó, 11 test cũ xanh không sửa assertion.
  2. Thêm `POST /auto-post/run-now` (ngoài plan gốc) để nghiệm thu không phải đợi đúng mốc giờ.
  3. `GET /publish-jobs/timeline` không làm — màn lịch đã có từ plan 12, chỉ bổ sung `slotRun`
     vào `GET /publish-schedule` + thêm `GET /publish-jobs` và `GET /publish-jobs/:id/events`.
- **Test:** BE 452 test / 38 suite xanh (+41: scheduler 13, slot-run repository 4, picker 6,
  executor 11, job events + sanitize 7). FE 32 test cũ xanh. lint + build 2 phía xanh.
- **Còn nợ:**
  - Chưa đăng thật lên Facebook (thiếu Page token — contexts §6 mục 10).
  - Chưa smoke UI thật trang `/timeline` phần nhật ký + lý do skip.
  - Job kẹt `PUBLISHING` khi process chết giữa chừng: chưa có reconciliation cron (ngoài scope).
  - Đổi giờ một slot giữa ngày ⇒ dòng lịch giờ cũ mất `slotRun` (map theo `slot_id`, giữ lần
    chạy gần nhất). Chấp nhận ở MVP.

---

## 10. Bổ sung 2026-07-25 (yêu cầu user) — nút đăng lại ở màn Lịch đăng bài

**Vấn đề:** engine đã có retry tự động (3 lượt, backoff mũ 60s) nhưng hết lượt là job
nằm im ở `FAILED`; mốc giờ mà Bot bỏ qua (backend không chạy đúng lúc, hoặc lúc đó kho
hết bài) cũng không có đường chạy lại. Người dùng phải sửa tay trong DB — không chấp nhận
được khi nguyên nhân chỉ là nhất thời (mạng, Facebook 5xx, token vừa gia hạn).

**Đã làm — 2 mức, đúng 2 tình huống khác nhau:**

- **Mức job — `POST /publish-jobs/:id/retry`** (quyền `jobs:retry`, chỉ ADMIN theo docs/05 §2):
  đưa một job đã hỏng về `QUEUED` rồi xếp lại vào BullMQ. Chặn: job `SUCCESS` ⇒ 409,
  job đang `QUEUED`/`PUBLISHING` ⇒ 409 (worker còn giữ, đẩy lại sẽ đăng trùng lên page thật),
  page tạm dừng/đã xoá ⇒ 400, bài đã đăng lên chính page đó qua đường khác ⇒ 409.
  `attemptCount` về 0 để lần thử mới khớp `attemptsMade` của bull job mới.
  **Bull job cũ phải xoá trước** (`removeOnFail: false` ⇒ nó vẫn nằm trong Redis) và
  jobId mới có mốc thời gian `publish-<id>-retry-<ts>` — nếu add trùng jobId thì BullMQ
  bỏ qua lặng lẽ, bấm nút mà không có gì chạy. Ghi `publish_job_events` (ENQUEUED, kèm tên
  người bấm) + audit `PUBLISH_JOB_RETRY`.
- **Mức mốc giờ — `POST /auto-post/slots/:slotId/run-now`** (quyền `autopost:manage`):
  chạy lại đúng một slot ngay bây giờ, **không cần trùng phút**, cho mốc `MISSED` hoặc
  `SKIPPED/NO_CONTENT` (giờ kho đã có bài mới). Vẫn đi qua `slot_runs` claim theo **phút
  hiện tại** nên bấm liên tục trong một phút chỉ chạy một lần; picker đã loại bài đang có
  job chờ đăng nên không đăng trùng. Page tạm dừng/đã xoá/tắt auto hoặc slot đang tắt ⇒ 400.

**FE `/timeline`:** nút **"Đăng lại"** (Popconfirm) trên từng job `FAILED`/`CANCELLED`/`SCHEDULED`,
nút **"Chạy lại mốc này"** trên dòng slot còn thiếu bài so với kế hoạch. Cả hai ẩn khi
role không đủ quyền. Hook `useRetryPublishJob` / `useRunSlotNow` invalidate `publish-schedule`.

**Không đụng schema** (audit `action` là cột String) ⇒ `erd.md` giữ nguyên.

**Test:** BE 485 test xanh (+21: `publish-jobs.service.spec.ts` mới 13 case cho retry —
trạng thái không được retry, page tạm dừng/xoá, bài đã đăng, jobId mới khác jobId cũ,
Redis dọn rồi vẫn chạy được; scheduler +8 case `runSlotNow`). FE 32 test cũ xanh,
lint + build 2 phía xanh. **Chưa smoke UI thật.**
