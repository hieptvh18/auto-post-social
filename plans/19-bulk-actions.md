# Plan 19 — Multi action (thao tác hàng loạt) + `is_active` cho content

**Trạng thái:** 🟡 code xong (user duyệt plan 2026-08-03), **chưa bấm tay trên UI** · 2026-08-03

---

## 1. Yêu cầu (user 2026-08-03)

1. Chọn **nhiều record** rồi thao tác một lần: **xoá hàng loạt**, **ngưng dùng /
   dùng lại hàng loạt**.
2. Thêm cột DB mới `is_active` cho bảng content; **mọi nơi lấy video/ảnh ra dùng
   đều phải lọc `is_active = true`**.
3. Lần này **chỉ áp dụng cho trang Quản lý Ảnh/Video** (`/content`), nhưng cơ chế
   viết ở dạng dùng lại được cho resource khác sau này.
4. Bài `is_active = false` **vẫn hiện** trong danh sách — chỉ **làm mờ + gắn tag**,
   không ẩn.
5. Bài **không xoá được** (đã đăng lên page): **disable ô checkbox** ngay trên bảng;
   backend **vẫn validate lại** và trả về báo cáo "xoá được bao nhiêu / bỏ qua bao
   nhiêu" để FE hiện toast.

---

## 2. Quyết định thiết kế (chốt trước khi code)

### 2.1 `is_active` nghĩa là gì

`content_assets.is_active` = **"bài này còn được đem ra dùng không"**, **độc lập với
`status`** (duyệt/chưa duyệt):

| | `status` | `is_active` |
|---|---|---|
| Ai đổi | quy trình duyệt (`content:review`) | người quản kho |
| Nghĩa | bài đã đạt chuẩn chưa | bài còn được đem đăng nữa không |
| Bot lấy bài khi | `APPROVED` | **`is_active = true`** |

Tách 2 cột thay vì thêm một `ContentStatus` mới (vd `ARCHIVED`) vì: status có bảng
chuyển trạng thái riêng (`content-status.transition.ts`, `PUBLISHING`/`PUBLISHED`
chỉ Bot set) — nhét "ngưng dùng" vào đó sẽ đẻ thêm ~10 cặp chuyển trạng thái phải
test, trong khi thực chất đây chỉ là một công tắc bật/tắt.

**Không đụng tới bài đã đăng:** tắt `is_active` **không** gỡ bài khỏi page, không
sửa `publish_jobs`. Nó chỉ chặn **lần lấy bài tiếp theo**.

### 2.2 Những nơi phải lọc `is_active = true` (điểm dễ sót nhất của plan này)

| # | Nơi | File | Ghi chú |
|---|-----|------|---------|
| 1 | **Cron picker** | `auto-post/content-picker.repository.ts` | raw SQL — thêm `AND ca.is_active = TRUE`. **Sót chỗ này là bot vẫn đăng bài đã ngưng.** |
| 2 | **Đếm "kho còn bài"** (`readyCount`/`readiness`) | `auto-post-configs` + `slot-readiness.ts` | phải đếm cùng điều kiện với picker, nếu không UI báo "còn 5 bài" mà bot lại skip |
| 3 | **Đăng bài thủ công** | `manual-post` (chọn bài trong kho) | danh sách chọn + validate lúc submit |
| 4 | **Lịch đăng bài** | `publish-schedule` (cột "kho còn bao nhiêu bài") | dùng lại đường đếm ở #2 |
| 5 | **Dashboard** thẻ tồn kho | `dashboard.service.ts` | đếm "Chờ duyệt/Đã duyệt" **chỉ tính bài đang dùng** |
| 6 | `GET /content-assets` | `content-assets.repository.ts` | **NGƯỢC LẠI: không lọc** — đây là màn quản kho, phải thấy cả bài đã ngưng (yêu cầu #4) |

> Việc kiểm tra "đã phủ hết 6 chỗ" đưa thành checklist ở §5, không tin vào trí nhớ.

### 2.3 API — một khuôn chung cho mọi bulk action

Kết quả trả về dùng chung một shape (`common/bulk/bulk-result.ts`), để trang khác
sau này (`/users`, `/pages`, `/failed`) tái sử dụng không phải nghĩ lại:

```ts
interface BulkItemFailure { id: string; title: string; reason: string }
interface BulkResult {
  requested: number;
  succeeded: string[];          // id đã xử lý xong
  failed: BulkItemFailure[];    // id bị bỏ qua + lý do đọc được cho người dùng
}
```

Hai endpoint mới, đều nằm trong `content-assets`:

| Method | Route | Body | Quyền | Ghi chú |
|---|---|---|---|---|
| `POST` | `/content-assets/bulk-delete` | `{ ids: string[] }` | `content:delete` | xoá kèm file Drive, y như xoá đơn lẻ |
| `POST` | `/content-assets/bulk-active` | `{ ids: string[], isActive: boolean }` | `content:edit` | bật/tắt "đang dùng" |

Chốt về ngữ nghĩa:

- **Không all-or-nothing** (user chốt): làm được cái nào chạy cái đó, cái hỏng ghi
  vào `failed` kèm lý do. HTTP luôn **200** kể cả khi `failed` không rỗng — vì đây là
  kết quả hỗn hợp, không phải lỗi request. FE đọc `failed` để hiện toast.
- **Giới hạn 100 id/request** (`@ArrayMaxSize(100)`) — vượt ⇒ 400. Xoá 100 bài = 100
  lần gọi Drive; để không giới hạn thì một cú bấm nhầm treo cả process.
- **Xử lý tuần tự**, không `Promise.all`: Drive API có rate limit, và cần thứ tự lý do
  ổn định để test.
- **RBAC per-item**: dùng lại đúng `assertOwnership` của xoá đơn lẻ — CONTENT chọn
  nhầm bài người khác thì bài đó vào `failed` ("Chỉ thao tác được trên bài của chính
  mình"), **không** làm hỏng cả lô.
- Lý do bị bỏ qua (đúng bộ lỗi của thao tác đơn lẻ): `Bài đã đăng trên N page — không
  xoá được` · `Chỉ thao tác được trên bài của chính mình` · `Không tìm thấy content`
  (ai đó vừa xoá trước) · `Xoá file trên Drive thất bại`.
- **Audit**: ghi **một** dòng cho cả lô (`CONTENT_BULK_DELETE` / `CONTENT_BULK_ACTIVE`)
  với `afterValue = { requested, succeededIds, failedCount }`, **không** ghi 100 dòng
  lẻ — `/audit` sẽ không đọc nổi.

### 2.4 UI (`/content` — bản Real; nhánh mock giữ nguyên theo ADR-005)

- `Table` bật `rowSelection`, `getCheckboxProps`: **disable** khi
  `record.publishedPageIds.length > 0`, kèm tooltip *"Bài đã đăng lên page — không
  xoá được"*. Chọn-tất-cả cũng tự bỏ qua các dòng này.
- **Thanh hành động** hiện khi có ≥1 dòng được chọn (đặt ngay trên bảng):
  `Đã chọn N bài · [Ngưng dùng] [Dùng lại] [Xoá] [Bỏ chọn]`.
- Xoá phải qua `Popconfirm` nói rõ *"Xoá N bài? File trên Drive cũng bị xoá."*
- Sau khi chạy xong hiện toast theo kết quả:
  - toàn bộ OK ⇒ `message.success('Đã xoá 10 bài')`
  - hỗn hợp ⇒ `Modal.info`/`notification.warning`: *"Đã xoá 8/10 bài. 2 bài bị bỏ
    qua"* + list `title — lý do` (toast một dòng không đủ chỗ).
- Bài `is_active = false`: `rowClassName` làm mờ (`opacity: .55`) + `Tag` xám
  **"Ngưng dùng"** cạnh trạng thái duyệt. Vẫn sửa/mở Drawer bình thường.
- Drawer sửa bài thêm `Switch` **"Đang dùng"** (đổi lẻ 1 bài, cùng quyền `content:edit`).
- Thêm ô lọc **"Trạng thái dùng"** (`Đang dùng / Ngưng dùng`) — không bắt buộc theo
  yêu cầu nhưng gần như miễn phí (`?isActive=` đã có sẵn ở BE).
- Bỏ chọn sau khi thao tác xong và sau khi đổi trang/filter (tránh xoá nhầm dòng
  không còn nhìn thấy).

---

## 3. Schema (rule 05 — `erd.md` cập nhật **cùng lúc**, không để sau)

```prisma
model ContentAsset {
  // ...
  isActive Boolean @default(true) @map("is_active") // false = ngưng dùng, Bot không lấy nữa

  @@index([isActive])
  @@index([status, isActive, updatedAt]) // cron picker: APPROVED + đang dùng, order updated_at ASC
}
```

- `default(true)` ⇒ **toàn bộ bài cũ giữ nguyên hành vi** sau migration.
- Index `(status, is_active, updated_at)` **thay** vai trò của `(status, updated_at)`
  cho picker; giữ lại index cũ hay bỏ sẽ quyết khi đo `EXPLAIN` lúc code.
- Migration: `npx prisma migrate dev --name content_assets_is_active`.
- `erd.md`: thêm cột vào bảng `content_assets`, 1 dòng bảng Index, 1 dòng ghi chú ràng
  buộc (`is_active` khác `status` — mục 2.1), 1 dòng Lịch sử thay đổi.

---

## 4. Task list

### Backend
- [x] `schema.prisma` + `erd.md` + migration `content_assets_is_active`
- [x] `common/bulk/bulk-result.ts` — type + helper `runBulkSequential(ids, handler)`
- [x] DTO `bulk-content-assets.dto.ts` (`ids`: `@IsUUID each`, `@ArrayMaxSize(100)`, `@ArrayNotEmpty`)
      và `bulk-active.dto.ts` (thêm `isActive: boolean`)
- [x] `ContentAssetsService.bulkDelete()` / `bulkSetActive()` — dùng lại `assertOwnership`,
      kiểm bài đã đăng, gom `BulkResult`, ghi 1 dòng audit/lô
- [x] 2 route mới + `@RequirePermission` (đặt **trước** route `:id`)
- [x] `isActive` vào `UpdateContentAssetDto` + `QueryContentAssetsDto` + mapper + repository
- [x] **Lọc `is_active = true` ở đủ 6 chỗ §2.2** (5 chỗ thêm filter + 1 chỗ cố ý không lọc)
- [x] Audit action mới `CONTENT_BULK_DELETE`, `CONTENT_BULK_ACTIVE`

### Frontend
- [x] `types`: `isActive` trong `ContentAssetResponse` + body update + query; type `BulkResult`
- [x] `contentAssets.api.ts`: `bulkDelete`, `bulkSetActive`; hook `useBulkContentActions`
      (invalidate `content-assets`)
- [x] `ContentManagementPage`: `rowSelection` + checkbox disabled, thanh hành động,
      Popconfirm, toast/Modal báo cáo kết quả, row mờ + tag "Ngưng dùng", `Switch`
      trong Drawer, ô lọc "Trạng thái dùng"

### Test (rule 02 — vùng bắt buộc: picker + RBAC)
- [x] Picker **bỏ qua bài `is_active = false`** (bổ sung vào `content-picker.repository.spec`)
- [x] `readyCount` đếm khớp picker (không đếm bài đã ngưng)
- [x] `bulkDelete`: 3 bài OK + 1 bài đã đăng ⇒ `succeeded` 3, `failed` 1 đúng lý do,
      **không** ném lỗi; Drive chỉ bị gọi 3 lần
- [x] `bulkDelete`: CONTENT chọn lẫn bài người khác ⇒ bài đó vào `failed`, bài mình vẫn xoá
- [x] `bulkDelete`: id không tồn tại ⇒ `failed`, không làm hỏng cả lô
- [x] `bulkSetActive`: bật/tắt đúng, ghi 1 dòng audit cho cả lô
- [x] DTO: 101 id ⇒ 400 · mảng rỗng ⇒ 400
- [x] Manual post: chọn bài đã ngưng ⇒ 400

### Nghiệm thu tay (ghi vào `contexts.md` §6 nếu chưa làm)
- [ ] Chọn 3 bài (1 bài đã đăng ⇒ checkbox mờ) → Xoá → toast báo đúng số
- [ ] Ngưng dùng 2 bài → dòng mờ + tag → `POST /auto-post/run-now` ⇒ bot **không** lấy 2 bài đó
- [ ] Bật lại → bot lấy bình thường

---

## 5. Rủi ro / điểm dễ sai

1. **Sót một trong 6 chỗ ở §2.2** ⇒ bài "đã ngưng" vẫn lên page thật. Đây là hậu quả
   nặng nhất của plan này ⇒ test picker là **bắt buộc**, không phải tuỳ chọn.
2. **`readyCount` lệch picker** ⇒ UI báo "còn bài" nhưng cron `SKIPPED/NO_CONTENT`,
   đúng cái bẫy đã gặp ở plan 07.
3. **Xoá nhầm hàng loạt là không hoàn tác được** (xoá luôn file Drive). Chốt: giữ
   `Popconfirm` bắt buộc + trần 100 bài/lần.
4. Bài đang có job `QUEUED`/`PUBLISHING` mà bị tắt `is_active`: job **vẫn chạy** (đã
   qua bước pick). Đây là hành vi cố ý — nêu ra để không bị coi là bug.

---

## 6. Kết quả (2026-08-03)

- Migration `20260803154543_content_assets_is_active`, `erd.md` đã cập nhật.
- BE **687 test xanh (+34)**, FE 35 test cũ xanh, lint + build 2 phía xanh.
- Endpoint: `POST /content-assets/bulk-delete`, `POST /content-assets/bulk-active`.
- **Đã smoke API thật** (server riêng cổng 3002, dữ liệu đã trả về trạng thái cũ):
  - xoá lô 2 bài đã đăng ⇒ `succeeded: []`, `failed` đúng 2 lý do
    ("Bài đã đăng trên 1 page", "Không tìm thấy content"), không xoá nhầm gì;
  - `ids: []` ⇒ 400 · 101 id ⇒ 400 "ids must contain no more than 100 elements";
  - `bulk-active false` cho 3 bài ⇒ readiness của page đổi `NO_MATCH` → `NO_ASSIGNMENT`
    (đúng: bài ngưng dùng không còn được tính là hàng chờ), bật lại thì về như cũ;
  - đăng tay bài đang ngưng dùng ⇒ 400 kèm câu tiếng Việt;
  - audit ghi **1 dòng/lô** `CONTENT_BULK_ACTIVE` với `changedIds` + `failedCount`.

### Lỗi bắt được nhờ smoke (không unit test nào thấy)

`?isAds=false` (có từ plan 11) và `?isActive=false` bị hiểu thành **`true`**:
ValidationPipe bật `enableImplicitConversion` nên `Boolean('false') === true` chạy
**trước** `@Transform`, khiến `@Transform(({ value }) => ...)` nhận sẵn `true`. Sửa:
đọc giá trị gốc từ `obj[key]` thay vì `value`, kèm test khoá lại
(`bulk-content-assets.dto.spec.ts` §QueryContentAssetsDto).

**Còn nợ:** chưa bấm tay trên UI — `contexts.md` §6 mục 26.
