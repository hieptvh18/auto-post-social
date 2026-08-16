# Plan 32 — Cấu hình giờ chạy cron reup từ giao diện

**Milestone:** M12 · **Trạng thái:** 🟡 code+test xong 2026-08-16 (chưa bấm tay)
**Phụ thuộc:** [29-reup-cron-pipeline.md](./29-reup-cron-pipeline.md) **phải xong**
(cần có cron thật rồi mới có cái để cấu hình). Nên làm **sau** [30](./30-reup-cleanup.md)
để gộp luôn giờ cron dọn dẹp vào cùng một tab.
**Spec tham chiếu:** không có — plan này là spec tạm
**Bản đồ:** [README.md](./README.md)

---

## 1. Mục tiêu

Hôm nay giờ chạy cron reup **hardcode trong code**:

```ts
@Cron('0 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })   // reup-discovery.scheduler.ts
@Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })   // reup-cleanup.scheduler.ts (plan 30)
```

Muốn đổi 02:00 sang giờ khác thì phải **sửa code + deploy lại** — không chấp nhận được
với thứ mà người vận hành cần chỉnh theo thói quen thật (yêu cầu user 2026-08-15).

Sau plan này: SUPER_ADMIN vào tab **Lịch chạy** trong `/reup`, đặt giờ quét và giờ dọn
dẹp, bật/tắt cron, **có hiệu lực ngay không cần restart backend**.

## 2. Ngoài phạm vi

- **Không** làm cron chạy nhiều lần/ngày (vd 2 lần sáng–chiều). Chống double-fire hiện
  dựa vào UNIQUE `(topic_id, run_date)` — **1 lượt/chủ đề/NGÀY**. Muốn nhiều lần/ngày
  phải đổi khoá đó (thêm `run_time` như `slot_runs`), là việc lớn hơn hẳn ⇒ plan riêng.
- **Không** cho đặt lịch riêng cho từng chủ đề. Một giờ chung cho toàn bộ.
- **Không** làm cron expression tự do (`*/15 * * * *`). Chỉ chọn **giờ:phút** — cho người
  vận hành, không phải cho DevOps; gõ sai cron expression là hỏng âm thầm.
- **Không** đụng cron của auto-post (`* * * * *`) hay cron dọn `media_upload_jobs`.

## 3. Thiết kế

### 3.1 Lưu ở `app_settings`, không phải `.env` (ADR-014)

```ts
SettingKey.REUP_SCHEDULE = 'reup_schedule'

interface ReupScheduleSettingsValue {
  /** Bật/tắt toàn bộ cron quét. false = chỉ chạy được bằng nút "Quét ngay". */
  discoveryEnabled: boolean;
  /** 'HH:mm' theo Asia/Ho_Chi_Minh — cùng quy ước `auto_post_slots.time`. */
  discoveryTime: string;      // mặc định '02:00'
  cleanupEnabled: boolean;    // gộp với `ReupCleanupSettingsValue.enabled` của plan 30
  cleanupTime: string;        // mặc định '03:00'
}
```

> **Quyết định cần chốt khi code:** plan 30 đã có `SettingKey.REUP_CLEANUP` chứa
> `enabled` + `retentionDays`. Nên **gộp** `cleanupTime` vào đó thay vì đẻ key thứ hai
> chứa nửa cấu hình dọn dẹp — hai nơi cùng nói về một cron là nguồn lệch chắc chắn.

### 3.2 Cách đổi giờ mà **không** restart — chỗ dễ sai nhất

`@Cron('0 2 * * *')` là **decorator, đọc hằng số lúc class được nạp** ⇒ không thể đổi
bằng cách sửa DB. Ba hướng:

| Hướng | Đánh giá |
|---|---|
| **(a)** `SchedulerRegistry` — xoá `CronJob` cũ, `addCronJob` cái mới khi settings đổi | ✅ **Chọn** — API chính thức của `@nestjs/schedule`, đổi có hiệu lực ngay |
| (b) Giữ `@Cron` mỗi phút, tự so `HH:mm` với settings rồi mới chạy | Đơn giản nhưng cron chạy 1440 lần/ngày chỉ để so chuỗi; và **trùng khuôn auto-post** nên dễ nhầm 2 cơ chế |
| (c) Restart app khi đổi settings | Không chấp nhận được |

**Hướng (a) chi tiết:**

```text
onModuleInit()          → đọc settings → đăng ký CronJob với tên cố định
                          'reup-discovery' / 'reup-cleanup'
PUT /reup/settings/schedule → lưu DB → gọi rescheduleAll()
rescheduleAll()         → registry.deleteCronJob(name) nếu tồn tại
                          → nếu enabled: addCronJob(name, new CronJob(expr, ...))
```

**Ba cạm bẫy bắt buộc xử lý:**

1. **`deleteCronJob` ném lỗi khi job chưa tồn tại** ⇒ phải `try/catch` hoặc kiểm
   `registry.doesExist('cron', name)`. Lần đầu boot chưa có job nào.
2. **Job cũ phải `stop()` trước khi xoá** — không thì nó vẫn tick sau khi đã bị gỡ khỏi
   registry, và bạn có **hai** cron cùng chạy (chống double-fire ở DB sẽ cứu, nhưng
   `/reup/runs` hiện một dòng còn log hiện hai lượt ⇒ rất khó lần).
3. **Settings hỏng/không đọc được lúc boot ⇒ dùng mặc định `02:00`/`03:00`, KHÔNG crash
   app.** Cron reup là tính năng phụ (QĐ-6) — DB settings lỗi mà làm app không boot được
   là vi phạm đúng nguyên tắc đã giữ suốt plan 26→31.

### 3.3 Validate

Kiểm ở **service** (không ở DTO — cần đọc state hiện tại):

- `discoveryTime` / `cleanupTime` khớp `^([01]\d|2[0-3]):[0-5]\d$` ⇒ sai thì 400
- **Hai giờ không được trùng nhau** ⇒ 400. Dọn dẹp chạy cùng lúc quét thì có thể xoá file
  của bài mà lượt quét đang xử lý; giữ khoảng cách như hiện tại (02:00 / 03:00).
- Khuyến nghị (cảnh báo, không chặn): đặt **ngoài khung giờ đăng bài** của `/auto-post`,
  vì tải video ăn băng thông đúng lúc Bot đang đẩy video lên Facebook.

### 3.4 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `GET` | `/reup/settings/schedule` | `reup:view` | trả cấu hình + **giờ chạy kế tiếp** của mỗi cron |
| `PUT` | `/reup/settings/schedule` | `reup:manage` | lưu + `rescheduleAll()` ngay |

`nextRunAt` lấy từ `CronJob.nextDate()` — đây là thứ chứng minh cấu hình **đã có hiệu lực
thật**, không phải chỉ ghi vào DB. Không có nó thì người dùng đổi giờ xong không có cách
nào biết nó ăn chưa.

### 3.5 Frontend — tab **Lịch chạy** trong `/reup`

- 2 khối: *Quét video* và *Dọn dẹp file*, mỗi khối gồm Switch bật/tắt + `TimePicker`
  (`format="HH:mm"`, `minuteStep={5}`).
- Dòng chữ dưới mỗi khối: **"Lần chạy kế tiếp: 16/08/2026 02:00"** — đọc từ `nextRunAt`.
- Cảnh báo vàng khi giờ quét rơi vào khung giờ có mốc đăng bài của `/auto-post`.
- Nút "Quét ngay" (đã có ở tab Chủ đề) giữ nguyên — đó là đường chạy tay, độc lập lịch.

## 4. Task

**Backend**
- [x] `SettingKey.REUP_SCHEDULE` + type + validate §3.3
- [x] `reup-schedule.service.ts` — đọc/ghi settings, `rescheduleAll()`
- [x] Xoá `reup-discovery.scheduler.ts` (`@Cron` cố định) — tick chuyển vào
      `ReupScheduleService` qua `SchedulerRegistry` (§3.2)
- [x] Xoá `reup-cleanup.scheduler.ts` tương tự
- [x] `onModuleInit` đăng ký job lần đầu; settings lỗi ⇒ dùng mặc định, **không crash**
- [x] 2 endpoint §3.4 + Swagger + `@RequirePermission`
- [x] Trả `nextRunAt` từ `CronJob.nextDate()`

**Frontend**
- [x] Tab **Lịch chạy** trong `ReupSettingsPage.tsx`
- [x] `TimePicker` + Switch + hiện "Lần chạy kế tiếp"
- [x] `invalidateQueries` sau khi lưu

**Test bắt buộc** (đổi lịch cron = dễ sai, hậu quả: cron không chạy hoặc chạy 2 lần)
- [x] Đổi giờ ⇒ job cũ bị `stop()` **và** xoá khỏi registry (assert mock) — không còn 2 job
- [x] `enabled = false` ⇒ **không** đăng ký job nào
- [x] `deleteCronJob` khi job chưa tồn tại (lần boot đầu) ⇒ **không** ném lỗi
- [x] Settings trong DB hỏng ⇒ dùng mặc định `02:00`, app vẫn boot
- [x] `discoveryTime` sai định dạng ⇒ 400
- [x] `discoveryTime` trùng `cleanupTime` ⇒ 400
- [x] RBAC: gác bởi `@RequirePermission('reup:manage')` — cùng guard dùng chung, đã có
      test bao quát ở `permissions.spec.ts`; không thêm test 403 riêng cho controller này
      (đúng khuôn các controller reup khác, guard là hạ tầng dùng chung)

**Chốt**
- [x] `npm run lint && npm run build` xanh BE + FE · `npm run test` xanh (1123 test BE)
- [x] `.env.example`: **không đổi** (cấu hình ở `app_settings`)
- [x] `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

- [ ] Đổi giờ quét sang **2 phút sau thời điểm hiện tại** ⇒ đợi ⇒ `/reup/runs` có dòng
      mới đúng giờ đó, **không cần restart backend**
- [ ] `GET /reup/settings/schedule` trả `nextRunAt` khớp giờ vừa đặt
- [ ] Tắt `discoveryEnabled` ⇒ qua giờ đó **không** có dòng run nào sinh ra
- [ ] Đổi giờ 3 lần liên tiếp ⇒ vẫn **đúng 1** lượt chạy (không tích luỹ job cũ)
- [ ] Restart backend ⇒ giờ đã đặt **vẫn giữ**, không quay về 02:00
- [ ] Đặt `discoveryTime = cleanupTime` ⇒ 400, thông báo tiếng Việt rõ nghĩa
- [ ] ADMIN không thấy tab Lịch chạy; gọi thẳng API ⇒ 403

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Job cũ không `stop()` ⇒ **2 cron cùng chạy**, log lặp, rất khó lần | `stop()` rồi mới `deleteCronJob`; test khẳng định cả 2 lời gọi |
| R2 | `deleteCronJob` ném lỗi lúc boot đầu (chưa có job) ⇒ app không khởi động | Kiểm `doesExist` trước; test riêng cho lần boot đầu |
| R3 | Settings DB hỏng ⇒ app crash vì cron phụ | Dùng mặc định `02:00`/`03:00`, log WARN, **không** ném (QĐ-6) |
| R4 | Đặt giờ quét trùng khung giờ đăng bài ⇒ tải video giành băng thông với lúc đẩy video lên Facebook | Cảnh báo trên UI (không chặn — người vận hành tự quyết) |
| R5 | User tưởng đổi giờ là chạy được nhiều lần/ngày | UI ghi rõ **"mỗi chủ đề chỉ quét 1 lần/ngày"**; muốn khác ⇒ plan riêng (§2) |
| R6 | Giờ lưu dạng `'HH:mm'` nhưng cron chạy theo timezone server | Cố định `timeZone: 'Asia/Ho_Chi_Minh'` khi tạo `CronJob`, cùng quy ước `auto_post_slots.time` (rule 01 §Thời gian) |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-08-16 (code + unit test; §5 điều kiện nghiệm thu tay chưa bấm)
- **File chính:**
  - `backend/src/modules/reup/reup-schedule.service.ts` (mới — quản lý 2 `CronJob` qua
    `SchedulerRegistry`)
  - `backend/src/modules/reup/reup-schedule.controller.ts` + `dto/update-reup-schedule.dto.ts`
  - `backend/src/modules/settings/settings.types.ts` + `settings.service.ts`
    (`REUP_SCHEDULE`)
  - `backend/src/modules/reup/reup.constants.ts` (tên job cố định + timezone)
  - Xoá: `reup-discovery.scheduler.ts`, `reup-cleanup.scheduler.ts`,
    `__tests__/reup-cleanup.scheduler.spec.ts`
  - FE: `ReupSettingsPage.tsx` (tab **Lịch chạy**), `hooks/useReupTopics.ts`,
    `api/reup.api.ts`, `types/reup.ts`
- **Khác thiết kế ban đầu:**
  - Không tách `cleanupTime` vào key `REUP_CLEANUP` như plan §3.1 gợi ý cân nhắc — giữ
    một key `REUP_SCHEDULE` chứa lịch của **cả hai** cron (đơn giản hơn: đọc một bản ghi
    là biết toàn bộ lịch reup); `REUP_CLEANUP` giữ nguyên vai trò "cấu hình nghiệp vụ xoá
    gì" (`enabled`/`retentionDays`), tách bạch với "lịch chạy khi nào".
  - Cảnh báo trùng khung giờ auto-post (§3.5, R4) làm dạng **Alert tĩnh** nhắc người vận
    hành tự kiểm tra, không fetch slot thật của mọi page để so khớp chính xác — slot là
    theo từng page (không có API gộp toàn hệ thống), chi phí thêm không đáng so với một
    cảnh báo không chặn; đã hỏi và chốt với user.
- **Test:** +22 test BE (1123 tổng) — 15 trong `reup-schedule.service.spec.ts` (boot đầu
  không lỗi dù registry rỗng, đổi giờ stop+xoá đúng job cũ không tích luỹ, tắt job không
  đăng ký, nextRunAt null khi tắt, lỗi discovery/cleanup không thoát khỏi onTick) + case
  mới trong `settings.service.spec.ts` (bản ghi hỏng/field sai định dạng/repository lỗi ⇒
  mặc định không ném, 2 case 400 định dạng + trùng giờ). Lint/build 2 phía xanh.
- **Còn nợ:** điều kiện nghiệm thu §5 (bấm tay đổi giờ 2 phút sau hiện tại, đợi cron bắn
  đúng giờ không cần restart) — cần chạy backend thật với downloader/Drive cấu hình sẵn,
  việc của user.
