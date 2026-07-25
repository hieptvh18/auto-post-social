# Plan 11 — Content giai đoạn 2 (duyệt / ADS / phân bổ page) + Hashtag & Danh mục quick-update

**Milestone:** M3 giai đoạn 2 (nối tiếp `plans/04-content-assets.md` §4 "Giai đoạn 2")
**Trạng thái:** 🟡 đang làm
**Phụ thuộc:** M3 giai đoạn 1, M4 (facebook-pages)
**Spec:** `docs/03-database-design.md` §5, `docs/04-api-spec.md` §5, `docs/05-rbac.md` §3

---

## 1. Mục tiêu

Hai việc user yêu cầu 2026-07-25:

1. **Mở lại 3 khối UI đang bị ẩn** ở trang "Quản lý Ảnh/Video Edit" (bản Real):
   **Phân bổ page**, **Trạng thái duyệt**, checkbox **Đạt ADS** — kèm backend thật
   (transition status, `isAds`, assignment content↔page).
2. **Hashtag quick-update:** ô Hashtags thành input dạng tag — vừa gõ vừa gợi ý
   hashtag đã dùng, chưa có thì Enter là tạo mới ngay. **Không** làm popup/trang
   quản lý hashtag riêng.
3. **Danh mục ("Dạng") quick-update** (bổ sung 2026-07-25, cùng cơ chế): ô Dạng ở
   popup Upload + Drawer sửa thành select-1 gõ được — lọc danh mục đã có, gõ tên
   chưa có thì dropdown hiện "＋ Thêm ..." dùng luôn. Bỏ danh sách hardcode
   `CONTENT_CATEGORIES` khỏi các ô chọn (chỉ còn là danh sách mồi khi DB rỗng).

## 2. Ngoài phạm vi

- Không thêm bảng `hashtags` lẫn bảng `categories` — gợi ý lấy từ chính
  `content_assets.hashtags` / `content_assets.category` (schema **không đổi** ⇒
  không cần migration, `erd.md` giữ nguyên).
- Không làm bulk action / lịch sử phiên bản content.
- Không đụng `MockContentManagementPage` (giữ nguyên theo ADR-005).

## 3. Thiết kế

### 3.1 Backend — `PATCH /content-assets/:id` mở rộng

DTO thêm: `status`, `isAds`, `rejectComment`, `assignedPageIds`.
`POST /content-assets` thêm `assignedPageIds` (gán ngay lúc upload).
`GET /content-assets` thêm filter `status`, `isAds`.

**RBAC field-level (kiểm ở service, không phải chỉ guard):**

- Payload có `status` / `isAds` / `rejectComment` ⇒ đòi `content:review` ⇒ CONTENT ⇒ 403.
- CONTENT vẫn chỉ thao tác bài `createdById === actor.id` (đã có từ giai đoạn 1).
- CONTENT sửa bài đang `REJECTED` ⇒ tự về `PENDING_REVIEW`, xoá `rejectComment`
  (docs/05 §3).

**`transitionStatus(from, to)` — hàm thuần, theo `docs/03` §5:**

| From \ To | PENDING_REVIEW | APPROVED | REJECTED |
|---|:--:|:--:|:--:|
| PENDING_REVIEW | (no-op) | ✓ | ✓ + lý do |
| APPROVED | ✓ | (no-op) | ✓ + lý do |
| REJECTED | ✓ | ✓ | (no-op) |

- `to ∈ {PUBLISHING, PUBLISHED}` ⇒ **422** (chỉ Bot set).
- `from ∈ {PUBLISHING, PUBLISHED}` ⇒ mọi thay đổi status ⇒ **422** (bài đang/đã đăng).
- `→ REJECTED` mà không có `rejectComment` (payload lẫn DB đều trống) ⇒ **400**.
- `→ APPROVED` ⇒ set `approvedById = actor.id`, xoá `rejectComment`.
- `→ PENDING_REVIEW` ⇒ xoá `approvedById` + `rejectComment`.

**Assignments (`assignedPageIds: string[]`)** — diff với hiện tại:

- Page id không tồn tại / đã xoá mềm ⇒ **400**.
- Gỡ assignment đã có `publishedAt != null` ⇒ **409** (đã đăng, không rút lại được).
- Trùng (content, page) do race ⇒ bắt P2002 ⇒ **409**.
- `remove()` cũng chặn xoá content đã có assignment published ⇒ **409**.

**Audit:** thêm `CONTENT_STATUS_CHANGE`, `CONTENT_ADS_MARK`, `CONTENT_ASSIGN_PAGE`.

**Mapper** thêm: `assignedPageIds`, `publishedPageIds`, `assignments[{pageId,
pageName, publishedAt, facebookPostId}]` (FE cần tên page để hiện tag).

### 3.2 Backend — gợi ý hashtag

`GET /content-assets/hashtags` → `{ tag: string; count: number }[]` (sắp theo
count desc). Repository đọc cột `hashtags` của mọi bài, service tách token theo
khoảng trắng và gộp không phân biệt hoa/thường. Route khai báo **trước** `@Get(':id')`
(nếu không `ParseUUIDPipe` sẽ nuốt mất). Mọi role đăng nhập đọc được — chỉ là chuỗi
tag, không kèm thông tin bài nào của ai.

Không tách module/bảng riêng: MVP vài trăm bài, quét cột là đủ; có bảng riêng thì
lại phải đồng bộ 2 nguồn.

### 3.2b Backend — gợi ý danh mục

`GET /content-assets/categories` → `{ category, count }[]` (groupBy `category`,
xếp theo count desc). Service gộp biến thể chỉ khác hoa/thường hoặc khoảng trắng
thừa; `create`/`update` `trim()` `category` để `'Thăm khám '` không đẻ danh mục thứ hai.

### 3.3 Frontend

| Thứ | Nội dung |
|-----|----------|
| `src/utils/hashtags.ts` | `parseHashtags(string): string[]`, `formatHashtags(string[]): string` — chuẩn hoá `#`, bỏ trùng (case-insensitive) |
| `src/components/common/HashtagInput.tsx` | `Select mode="tags"` nhận/trả **string**, `tokenSeparators=[' ', ',']`, options = gợi ý từ API kèm số lần dùng |
| `useHashtagSuggestions()` | React Query, `staleTime` 5 phút; invalidate khi create/update content |
| Bảng danh sách (Real) | **bỏ** cột "Người sửa gần nhất", **thêm** cột "Phân bổ page" (tag tên page, page đã đăng tô xanh) |
| Drawer sửa | mở lại: Phân bổ page (multi-select, option đã đăng bị khoá), Trạng thái duyệt (chỉ `content:review`), lý do không duyệt, checkbox Đạt ADS |
| Modal upload | thêm Phân bổ page + HashtagInput |
| Filter | thêm "Trạng thái duyệt"; ô "Dạng" dùng danh mục động + `showSearch` |
| `src/utils/categories.ts` | `mergeCategoryOptions` (API + danh sách mồi + giá trị đang chọn, dedupe), `normalizeCategory` |
| `src/components/common/CategorySelect.tsx` | select-1 `showSearch`, dòng đầu "＋ Thêm \"x\"" khi gõ tên chưa có |
| Chỗ khác hết hardcode | `AutoPostSettingsPage` (categories của slot) và `ManualPostModal` (filter danh mục) dùng chung `mergeCategoryOptions` |

Người sửa gần nhất vẫn xem được ở chân Drawer sửa (đã có sẵn) — không mất thông tin.

## 4. Task

- [x] Plan này
- [x] BE: DTO create/update/query mở rộng
- [x] BE: repository — include assignments, diff assignment trong transaction,
      `findHashtags()`, filter status/isAds
- [x] BE: service — `transitionStatus`, RBAC field-level, `syncAssignments`,
      chặn xoá bài đã đăng, audit mới
- [x] BE: mapper trả `assignedPageIds`/`publishedPageIds`/`assignments`
- [x] BE: test transition matrix + RBAC field-level + assignment + reject thiếu lý do
- [x] FE: types + api + hooks (hashtag suggestions)
- [x] FE: `utils/hashtags.ts` + test Vitest
- [x] FE: `HashtagInput` dùng ở modal upload & drawer sửa
- [x] FE: bảng đổi cột, drawer mở lại 3 khối, filter trạng thái
- [x] `npm run lint && npm run build && npm run test` cả 2 phía
- [x] Cập nhật `contexts.md` + tick plan 04 giai đoạn 2
- [x] BE `GET /content-assets/categories` + gộp/trim danh mục + test
- [x] FE `utils/categories.ts` (+6 test) + `CategorySelect` dùng ở Upload/Drawer/filter
- [x] Bỏ `CONTENT_CATEGORIES` hardcode khỏi AutoPostSettingsPage + ManualPostModal

## 5. Điều kiện nghiệm thu

Đã kiểm bằng **curl với backend thật** (port tạm 3002, dữ liệu smoke đã dọn sạch):

- [x] CONTENT gửi `{status:'APPROVED'}` ⇒ 403; `{isAds:true}` ⇒ 403
- [x] ADMIN gửi `{status:'APPROVED', isAds:true}` ⇒ 200, `approvedById` đúng, lý do cũ bị xoá
- [x] `{status:'REJECTED'}` không kèm lý do ⇒ 400 "Nhập lý do không duyệt"
- [x] Gửi `{status:'PUBLISHED'}` ⇒ 422
- [x] Gỡ page đã đăng ⇒ 409; DELETE bài đã đăng ⇒ 409
- [x] Gán page id hợp lệ nhưng không tồn tại ⇒ 400 (message có id)
- [x] CONTENT sửa caption bài `REJECTED` của mình ⇒ tự về `PENDING_REVIEW`, xoá lý do
- [x] CONTENT tự phân bổ page ⇒ được (docs/05 §3)
- [x] Tạo bài với `hashtags: '#smoke #tưthế'` ⇒ `GET /content-assets/hashtags` có ngay 2 tag
- [x] Tạo bài với `category: '  Dạng mới XYZ  '` ⇒ lưu đã trim, `GET /content-assets/categories`
      có ngay danh mục mới
- [ ] **Chưa smoke UI thật**: bảng hiện cột Phân bổ page; duyệt/không duyệt/ADS trên Drawer

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Gợi ý hashtag quét toàn bảng mỗi lần mở form | `staleTime` 5 phút ở FE, chỉ select 1 cột ở BE |
| `updatedAt` đổi khi duyệt ⇒ ảnh hưởng thứ tự hàng đợi Bot | Đúng ý đồ (docs/03): bài vừa duyệt xuống cuối hàng đợi |
| CONTENT vô tình gỡ phân bổ page đã đăng | Chặn 409 ở BE + khoá option ở FE |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-25 (chờ smoke UI)
- **File chính:** `backend/src/modules/content-assets/content-status.transition.ts` (mới),
  `content-assets.{service,repository,controller}.ts`, `content-asset.mapper.ts`,
  `dto/{create,update,query}-content-asset.dto.ts`,
  `frontend/src/utils/{hashtags,categories}.ts` (mới),
  `frontend/src/components/common/{HashtagInput,CategorySelect}.tsx` (mới),
  `frontend/src/pages/ContentManagementPage.tsx`, `hooks/useContentAssets.ts`,
  `api/contentAssets.api.ts`, `types/index.ts`
- **Khác thiết kế ban đầu:**
  - Bảng danh sách **bỏ luôn cột "Người sửa gần nhất"** (yêu cầu user giữa chừng) —
    thông tin đó vẫn còn ở chân Drawer sửa. Cột "Trạng thái" gánh thêm tag "Đạt ADS".
  - `GET /content-assets` thêm filter `status`/`isAds`; FE mới dùng `status`.
  - Gửi `rejectComment` mà không kèm `status` = sửa lại lý do, không đổi trạng thái.
  - Validate page tồn tại đặt trong `ContentAssetsRepository.findExistingPageIds`
    thay vì import `FacebookPagesRepository` — tránh phụ thuộc chéo module chỉ để
    đọc 1 cột id.
- **Test:** BE 383 test / 30 suite xanh (+22: ma trận transition, RBAC field-level,
  diff assignment, 409 gỡ page đã đăng, 409 xoá bài đã đăng, gộp hashtag).
  FE 32 test xanh (+9 `utils/hashtags.ts`, +6 `utils/categories.ts`). lint + build 2 phía xanh.
  Đã smoke toàn bộ §5 bằng curl với backend thật.
- **Còn nợ:** chưa smoke UI thật. `HashtagInput`/`CategorySelect` chưa có test
  component (rule 02 FE không bắt buộc — logic thuần đã tách ra `utils/` và có test);
  bản Mock của trang giữ nguyên `Input`/`Select` cũ.
