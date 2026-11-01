# Plan 36 — Cờ "Nguồn mới" (`is_source_new`) cho Ảnh/Video

**Milestone:** Phase 2 — mở rộng M3/M4 (Quản lý Ảnh/Video, plan 04)
**Trạng thái:** 🟡 code + test + migrate DB dev xong 2026-11-01 — **chưa bấm tay trên UI thật**
**Phụ thuộc:** Plan 04 (`content_assets`), Plan 23 (upload qua `media_upload_jobs`),
Plan 24 (nhập link Drive), Plan 29 (reup tạo content)
**Spec tham chiếu:** `docs/03` (content) · `.claude/rules/05-database-erd.md`

---

## 1. Mục tiêu

Mỗi bài Ảnh/Video có thêm cờ **Nguồn mới / Nguồn cũ** (`is_source_new`, mặc định `true`).
Người dùng tick/bỏ tick ở popup **Thêm mới** và **Sửa**, thấy cờ trên bảng, và **lọc** được
theo cờ này ở màn Quản lý Ảnh/Video.

## 2. Ngoài phạm vi

- **Không** cho Bot/picker auto-post dùng cờ này để chọn bài (chỉ là nhãn phân loại). Nếu sau
  muốn "ưu tiên đăng nguồn mới" ⇒ plan riêng, chạm vùng bắt buộc test của auto-post.
- **Không** tự động chuyển mới → cũ theo thời gian.
- **Không** thêm vào bulk action (đổi hàng loạt) — ghi §6 contexts nếu user cần.
- Filter Mới/Cũ trên Dashboard thuộc plan 35 §3.6.

## 3. Thiết kế

### 3.1 Schema (rule 05 — sửa schema ⇒ sửa `erd.md` cùng thay đổi)

```prisma
model ContentAsset {
  ...
  /// Plan 36: true = nguồn (ảnh/video) MỚI, false = nguồn CŨ. Chỉ là nhãn phân loại,
  /// Bot không dùng để chọn bài.
  isSourceNew   Boolean @default(true) @map("is_source_new")
  ...
  @@index([isSourceNew])   // filter "Nguồn" trên màn Quản lý Ảnh/Video
}
```

Migration mới: `npx prisma migrate dev --name content_is_source_new`.
`ADD COLUMN ... DEFAULT true NOT NULL` ⇒ **toàn bộ bài hiện có sẽ là `true` (Mới)** — xem câu
hỏi mở §7.1.

Index: bảng `content_assets` nhỏ, boolean selectivity thấp — index đơn lẻ ít tác dụng. **Đề xuất
không thêm index** (giữ giống `isAds`, hiện cũng không có index). Nếu thêm thì phải ghi vào
bảng Index của `erd.md` kèm lý do.

### 3.2 Backend

| File | Thay đổi |
|------|----------|
| `dto/create-content-asset.dto.ts` | `isSourceNew?: boolean` `@IsOptional() @IsBoolean()` (bỏ trống ⇒ DB default `true`) |
| `dto/update-content-asset.dto.ts` | `isSourceNew?: boolean` — **không** đòi `content:review` (khác `isAds`): ai sửa được bài thì sửa được cờ — xem §7.2 |
| `dto/query-content-assets.dto.ts` | `isSourceNew?: boolean` dùng **đúng** `@Transform(toBoolean)` như `isAds` (bẫy cũ: `?isAds=false` từng bị hiểu thành `true`) |
| `content-assets.repository.ts` | thêm vào filter type + `if (filter.isSourceNew !== undefined) where.isSourceNew = ...`; create/update data |
| `content-asset.mapper.ts` | response thêm `isSourceNew` |
| `media-upload-jobs` | `CreateMediaUploadJobDto` + `metadata` JSON thêm `isSourceNew`; worker truyền xuống khi tạo content (`media-upload-jobs.service.ts` ~L441). **Job cũ trong hàng đợi không có key** ⇒ `undefined` ⇒ DB default `true`, không lỗi |
| `media-upload-jobs.controller.ts` | multipart: field `isSourceNew` là **chuỗi** `'true'/'false'` ⇒ `@Transform(toBoolean)`; thêm vào schema Swagger multipart |
| `drive-imports.service.ts` (~L524) | nhập link Drive: truyền `isSourceNew` từ metadata như trên |
| reup pipeline (plan 29) | không truyền ⇒ default `true` (video reup luôn là nguồn mới). Không sửa code reup |

### 3.3 Frontend — `ContentManagementPage.tsx`

- **Type** `ContentAsset` trong `src/types/index.ts` + payload create/update/upload trong
  `contentAssets.api.ts`, `mediaUploadJobs.api.ts`, `driveImports.api.ts`.
- **Popup Thêm mới** (cả tab tải từ máy lẫn tab link Drive) và **popup Sửa**:
  `Form.Item name="isSourceNew" valuePropName="checked"` → `<Checkbox>Nguồn mới</Checkbox>`,
  đặt cạnh "Đạt ADS". `initialValues.isSourceNew = true` khi tạo; khi sửa lấy từ record.
- **Filter bar**: Select "Nguồn: Tất cả / Mới / Cũ" (map → `isSourceNew` `undefined/true/false`).
  User nói "checkbox" — nhưng checkbox chỉ có 2 trạng thái nên không biểu diễn được "Tất cả";
  dùng Select 3 lựa chọn cho đúng nghĩa lọc (cùng kiểu filter ADS nếu đang là Select). Xem §7.3.
- **Bảng**: Tag `Mới` (xanh) bên cạnh Tag "Đạt ADS" ở cột tiêu đề/trạng thái; bài cũ không gắn tag
  (đỡ rối). Đổi filter ⇒ reset trang 1 + bỏ chọn như filter khác.
- **Mock mode**: thêm `isSourceNew` vào mock data + lọc trong `MockContentManagementPage`.
- Mutation đã `invalidateQueries` sẵn — kiểm lại không sót.

## 4. Task

- [x] Sửa `schema.prisma` (thêm `isSourceNew`)
- [x] **Cập nhật `erd.md`**: cột `boolean is_source_new` ở `content_assets`, ghi chú ràng buộc
      ("chỉ là nhãn, Bot không dùng"), Lịch sử thay đổi, ngày + migration mới nhất ở đầu file
- [x] `npx prisma migrate dev --name content_is_source_new`
- [x] BE: DTO create/update/query, repository, mapper
- [x] BE: media-upload-jobs (DTO + multipart transform + metadata + worker) và drive-imports
- [x] Test: `query-content-assets.dto` — `isSourceNew=false` ra `false` (không bị thành `true`);
      `content-assets.service.spec` — filter truyền đúng xuống repository; media-upload worker
      — metadata thiếu key ⇒ không truyền (dùng default)
- [x] FE: type + api, Checkbox ở 2 popup tạo + popup sửa, filter, Tag trên bảng, mock
- [x] `npm run lint && npm run build` xanh BE + FE; `npm run test` BE
- [ ] Bấm tay UI thật (§5)
- [x] Cập nhật `contexts.md` + thêm dòng plan 36 vào `PLAN-MVP.md`
- [x] Nếu plan 35 đã xong: thêm filter Mới/Cũ cho tab Thống kê đăng bài (plan 35 §3.6)

## 5. Điều kiện nghiệm thu

- [ ] Mở popup Thêm mới ⇒ "Nguồn mới" **đã tick sẵn**; upload xong bài có `is_source_new = true`.
- [ ] Bỏ tick khi upload (cả từ máy và link Drive) ⇒ bài tạo ra `false`.
- [ ] Popup Sửa hiện đúng trạng thái hiện tại; đổi và lưu ⇒ bảng cập nhật ngay.
- [ ] Filter "Mới" chỉ ra bài `true`, "Cũ" chỉ ra bài `false`, "Tất cả" ra hết.
- [ ] Video reup mới kéo về ⇒ `true`.
- [ ] Kiểm tra `erd.md` theo checklist rule 05 (số bảng == số model, mermaid render được).

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Multipart gửi `'false'` bị ép thành `true` | Dùng `toBoolean` có sẵn, có test |
| Job upload đang xếp hàng lúc deploy (metadata cũ) | Key thiếu ⇒ default `true`, không crash |
| Mọi bài cũ thành "Mới" sau migration | Chốt §7.1 trước khi chạy migration (migration bất biến sau commit) |

---

## 7. Câu hỏi mở (chốt với user trước khi code)

1. **Bài đã có trong DB** khi chạy migration: để **`true` (Mới)** theo default, hay backfill
   **`false` (Cũ)** vì đó là kho cũ? (Default `true` cho bài **tạo mới** thì giữ nguyên.)
   Nếu chọn backfill `false`: migration thêm `UPDATE content_assets SET is_source_new = false;`
   sau `ADD COLUMN` — chỉ chạy một lần lúc migrate.
2. Ai được sửa cờ? Đề xuất: **ai sửa được bài thì sửa được cờ** (không cần `content:review`
   như Đạt ADS).
3. Filter dùng **Select 3 lựa chọn** (Tất cả/Mới/Cũ) thay cho checkbox — đồng ý không?

## 8. Kết quả (điền khi xong)

- **Ngày xong:** code 2026-11-01 (chờ bấm tay UI thật)
- **File chính:** BE `backend/prisma/schema.prisma`, `backend/src/modules/content-assets/**`
  (DTO create/update/query, repository, service, mapper), `backend/src/modules/media-upload-jobs/**`
  (DTO multipart + drive-import, metadata, 2 worker); FE `frontend/src/pages/ContentManagementPage.tsx`,
  `frontend/src/components/common/DriveImportPanel.tsx`, `frontend/src/types/index.ts`,
  `frontend/src/api/mediaUploadJobs.api.ts`
- **Migration:** `20261101153822_content_is_source_new` (đã chạy trên DB dev, **chưa chạy prod**)
- **Khác thiết kế ban đầu:** câu hỏi mở §7 chưa được trả lời ⇒ code theo đề xuất:
  (1) bài đã có **để `true` (Mới)** theo "default true" của user — nếu muốn bài cũ là Cũ thì phải
  sửa migration **trước khi commit**; (2) ai sửa được bài thì sửa được cờ; (3) filter là Select
  "Nguồn mới / Nguồn cũ" (bỏ trống = tất cả). Không thêm index. Mock mode màn Quản lý Ảnh/Video
  **chưa** có checkbox/filter (chỉ thêm field optional vào type). Đã làm luôn filter Nguồn cho
  tab Thống kê đăng bài (plan 35 §3.6), param URL `rSource=new|old`.
- **Test:** BE +14 (DTO query/multipart boolean, filter xuống repository, CONTENT đổi được cờ,
  không gửi thì không đụng cột, metadata job → worker, job cũ thiếu key, filter dashboard) —
  toàn bộ 1150 test xanh.
- **Còn nợ:** bấm tay UI thật (§5); chạy migration trên prod khi deploy.
