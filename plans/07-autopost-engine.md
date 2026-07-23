# Plan 07 — Auto-Post Engine (cron picker + BullMQ + publisher)

**Milestone:** M6 — **trọng tâm của MVP**
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 04, Plan 06
**Spec:** `docs/02-architecture.md` §5.3 §5.4 §6, `docs/03-database-design.md` §7,
`docs/07-facebook-publisher.md`, `docs/08-bullmq.md`

---

## 1. Mục tiêu

Bot tự động: đến mốc giờ của slot, chọn đúng bài đã duyệt theo category/media,
tạo publish job, stream file từ Drive lên Facebook Page, cập nhật kết quả về DB.
Không đăng lặp, không bỏ sót, không double-fire.

## 2. Ngoài phạm vi

Retry/cancel qua UI, DLQ dashboard, reconciliation cron, multi-worker leader election.
BullMQ vẫn cấu hình retry 3 lần + backoff, nhưng chưa làm màn hình quản trị.

## 3. Thiết kế

### 3.1 Tách trách nhiệm (để test được)

```text
AutoPostSchedulerService   @Cron('* * * * *', tz Asia/Ho_Chi_Minh)
  └─ tick(now)             : lấy slot đến giờ → mỗi slot gọi runSlot
  └─ runSlot(slot, now)    : claim slot-run → pick → tạo job → enqueue

SlotRunGuardService        : claim(slotId, runDate, runTime) → boolean
                             (INSERT slot_runs, bắt unique violation ⇒ false)  [ADR-006]

ContentPickerService       : pickForSlot(slot) → ContentAsset[]   ← hàm quan trọng nhất
PublishJobsService         : createQueuedJob(content, page) + enqueue BullMQ
PublishFacebookProcessor   : @Processor('publish-facebook')
FacebookPublisher          : publishImage / publishVideo (interface + fake driver)
ClockService               : now() — inject để test không phụ thuộc giờ thật
```

### 3.2 Picker query — bám đúng `docs/03` §7

```sql
SELECT c.* FROM content_assets c
JOIN content_page_assignments a
  ON a.content_asset_id = c.id
 AND a.facebook_page_id = $pageId
 AND a.published_at IS NULL
WHERE c.status IN ('APPROVED','PUBLISHED','PUBLISHING')
  AND c.category = ANY($categories)
  AND ($slotMediaType = 'all' OR c.media_type = $slotMediaType)
  AND NOT EXISTS (
    SELECT 1 FROM publish_jobs j
    WHERE j.content_asset_id = c.id AND j.facebook_page_id = $pageId
      AND j.status IN ('QUEUED','PUBLISHING'))
ORDER BY c.updated_at ASC
LIMIT $postCount;
```

Lý do `PUBLISHED`/`PUBLISHING` vẫn hợp lệ: bài đã đăng ở page A vẫn phải đăng được ở page B.

### 3.3 Luồng worker

```text
1. Load job + content + page (+ decrypt token). Job không còn QUEUED ⇒ bỏ qua (idempotent)
2. job → PUBLISHING; content → PUBLISHING
3. DriveStorage.createReadStream(driveFileId)
4. FacebookPublisher.publish(mediaType, stream, caption + hashtags)
5. OK  : job SUCCESS + facebookPostId
         assignment.publishedAt = now, facebookPostId
         content → PUBLISHED (nếu ≥1 assignment đã published)
         audit AUTO_PUBLISH
   Lỗi : job FAILED + errorMessage; BullMQ retry 3 lần, backoff mũ; hết retry ⇒ DLQ
         content quay lại APPROVED nếu chưa page nào đăng thành công
```

`FacebookPublisher` có driver `fake` (env `FACEBOOK_DRIVER`) trả `postId` giả — cho
phép chạy end-to-end không cần page thật.

## 4. Task

- [ ] `ClockService` + `SlotRunGuardService` (bảng `slot_runs`, bắt P2002)
- [ ] `ContentPickerService.pickForSlot` — raw query theo §3.2
- [ ] `AutoPostSchedulerService.tick/runSlot` + `@Cron('* * * * *', {timeZone})`
- [ ] `PublishJobsService.createQueuedJob` + enqueue, lưu `bullJobId`
- [ ] Đăng ký `BullModule.registerQueue('publish-facebook')`, retry 3 + backoff exponential
- [ ] `FacebookPublisher` interface + `GraphApiPublisher` (ảnh: `/{pageId}/photos`,
      video: `/{pageId}/videos`, timeout 120s, chỉ retry 5xx/network) + `FakePublisher`
- [ ] `PublishFacebookProcessor` theo §3.3, idempotent
- [ ] Cập nhật assignment + recompute content status trong **một transaction**
- [ ] `GET /publish-jobs` + `GET /publish-jobs/timeline?date=&pageId=&status=`
- [ ] Audit `AUTO_PUBLISH` (actor = Bot, `userId = null`)
- [ ] Env: `FACEBOOK_DRIVER`, `META_GRAPH_API_VERSION`, `META_APP_ID`, `META_APP_SECRET`,
      `AUTOPOST_ENABLED` (tắt cron khi chạy test/CI) → `.env` + `.env.example`
- [ ] **Unit test — BẮT BUỘC ở milestone này** (đây chính là logic phức tạp/dễ sai
      nhất của cả sản phẩm, ngoại lệ so với chủ trương "test khi cần" của MVP —
      picker sai ⇒ đăng lặp/thiếu, double-fire ⇒ spam page thật):
  - [ ] picker: đúng category · `mediaType=all` và cụ thể · loại assignment đã published ·
        loại content đã có job QUEUED/PUBLISHING · thứ tự `updated_at ASC` · tôn trọng
        `postCount` · không có bài ⇒ trả rỗng và skip có log
  - [ ] `tick` gọi 2 lần cùng slot/phút ⇒ chỉ tạo job một lần
  - [ ] scheduler bỏ qua slot disabled / page inactive / autopost off
  - [ ] processor: thành công ảnh · thành công video · lỗi FB ⇒ FAILED + errorMessage ·
        job đã SUCCESS/CANCELLED ⇒ bỏ qua không gọi FB
  - [ ] recompute status: 1/2 page xong ⇒ PUBLISHED · chưa page nào ⇒ quay lại APPROVED
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 4b. Nối frontend — TimelinePage

Làm ngay sau khi backend xanh, để quan sát Bot chạy trên UI thật (chính là tiêu chí
nghiệm thu MVP). Hạ tầng chung đã có ở Plan 03b.

- [ ] `src/api/publishJobs.api.ts`: `GET /publish-jobs/timeline?date=&pageId=&status=`
- [ ] `src/hooks/useTimeline.ts`: query key theo filter, có thể refetch định kỳ để
      thấy job chuyển trạng thái
- [ ] `TimelinePage`: bỏ mock cho trang này khi `VITE_USE_MOCK=false`; hiện job theo
      giờ/page/trạng thái; badge SUCCESS/FAILED/PUBLISHING
- [ ] Type response ở `src/types/`, đối chiếu Swagger
- [ ] `npm run lint && npm run build` (frontend) xanh

## 5. Điều kiện nghiệm thu (chạy thật, driver fake)

- [ ] 1 page + slot `HH:mm` sát giờ hiện tại, `postCount=2`, category `["Review"]`
- [ ] 3 video APPROVED category `Review`, gán vào page đó
- [ ] Tới giờ: đúng **2** job được tạo, đúng 2 bài có `updatedAt` cũ nhất
- [ ] Cả 2 job SUCCESS, assignment có `publishedAt` + `facebookPostId`, content `PUBLISHED`
- [ ] Chạy lại slot ngày hôm đó: **không** tạo lại job cho 2 bài đã đăng; bài thứ 3 mới được lấy
- [ ] Restart app giữa chừng ⇒ không đăng trùng
- [ ] **Trên UI thật** (`VITE_USE_MOCK=false`): mở TimelinePage thấy job xuất hiện
      và chuyển SUCCESS theo đúng slot
- [ ] Đổi sang `FACEBOOK_DRIVER=real` với page staging ⇒ bài lên thật

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Cron double-fire khi restart trong cùng phút | `slot_runs` UNIQUE (ADR-006) — có test riêng |
| Race hai tick song song | Claim slot-run bằng INSERT unique, không bằng SELECT-rồi-INSERT |
| Cron chạy trong unit test làm test giòn | `AUTOPOST_ENABLED=false` ở môi trường test |
| Video Drive lớn ⇒ timeout Graph API | Timeout 120s, log kích thước, ghi nợ nếu cần resumable upload |
| Content status bị ghi đè sai khi nhiều page song song | Cập nhật trong transaction, recompute từ assignments chứ không set mù |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
