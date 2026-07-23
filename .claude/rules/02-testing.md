# Rule 02 — Testing

## Chủ trương testing ở phase MVP (cập nhật 2026-07-23)

**MVP ưu tiên tốc độ.** Không còn bắt buộc 100% coverage cho mọi service. Viết unit
test **khi thực sự cần** — tức khi logic phức tạp, nhiều nhánh, hoặc sai thì hậu quả
nặng. CRUD thuần, mapper, delegate mỏng: **không cần** test riêng.

### Bắt buộc test (logic phức tạp / dễ sai / hậu quả nặng)

Những vùng sau **phải** có unit test đúng hành vi, không được bỏ:

- **Auto-post engine** (`src/modules/auto-post/**`) — picker + scheduler + chống
  double-fire + processor. Đây là ngoại lệ **vẫn nên phủ gần hết**: picker sai ⇒ đăng
  lặp/thiếu, double-fire ⇒ spam page thật. Xem danh sách case bắt buộc bên dưới.
- **Crypto / token** (`src/infra/crypto/**`, `crypto.util.ts`) — round-trip, ciphertext
  hỏng, sai key, mask; và mapper **không lộ token**.
- **Status transition** — mọi cặp hợp lệ/không hợp lệ, chặn client set PUBLISHING/PUBLISHED.
- **RBAC field-level** trong service (không phải chỉ guard).
- **Guard / decorator có logic** (`src/common/guards/**`, `src/common/decorators/**`).

### Không cần test (để đi nhanh)

- CRUD thuần qua repository, mapper/DTO chuyển đổi thẳng.
- `*.module.ts`, `*.controller.ts` (đảm bảo bằng smoke/e2e khi cần), `dto/**`, `*.entity.ts`.
- `main.ts`, `prisma/**`, `src/config/**`.

### Ngưỡng coverage

**Không đặt ngưỡng cứng 100% toàn cục nữa** cho phase MVP. Có thể đặt threshold **có
mục tiêu** cho riêng thư mục `auto-post` và `crypto` nếu muốn (khuyến khích), nhưng
không chặn build vì các module CRUD chưa test. Không hạ ngưỡng của **vùng bắt buộc**
để làm xanh CI — nếu vùng bắt buộc chưa test thì task **chưa Done**.

> Sau MVP, khi có thời gian, nâng dần coverage cho các service còn lại — ghi nợ vào
> `contexts.md` §6 thay vì cố phủ 100% ngay bây giờ.

## Cách viết test

- Framework: Jest. File `*.spec.ts` đặt trong `__tests__/` cạnh module.
- **Unit test service = mock repository và adapter.** Không đụng DB thật.
  Mock bằng object literal có type, không dùng `jest.mock` toàn file khi tránh được.
- Cấu trúc `describe(<Class>) > describe(<method>) > it('...')`.
- Tên test viết bằng tiếng Việt hoặc Anh đều được, nhưng phải mô tả **hành vi**:
  `it('ném ConflictException khi content đã được gán vào page')`.
- Mỗi test theo Arrange–Act–Assert, một hành vi một test.
- **Cấm** test phụ thuộc thời gian thật: dùng `jest.useFakeTimers()` hoặc inject
  `ClockService`. Cấm `sleep`.
- Không assert vào implementation detail (số lần gọi hàm private). Assert vào
  kết quả trả về và các side effect qua mock repository.

## Bắt buộc phải phủ

Đây là danh sách các nhánh **phức tạp/dễ sai** vẫn phải có test **đúng hành vi**
kể cả khi MVP không còn ép 100% coverage. Không viết test rỗng cho có:

| Vùng | Case bắt buộc |
|------|---------------|
| Cron picker | đúng category · đúng mediaType (kể cả `all`) · bỏ assignment đã `published_at` · bỏ content đã có job QUEUED/PUBLISHING · thứ tự `updated_at ASC` · tôn trọng `postCount` · hết bài thì skip |
| Chống double-fire | chạy tick 2 lần cùng slot/ngày ⇒ chỉ tạo job 1 lần |
| Status transition | mọi cặp hợp lệ trong `docs/03` §5 · mọi cặp không hợp lệ ném 422 · client tự set PUBLISHING/PUBLISHED bị chặn |
| Reject | thiếu `rejectComment` ⇒ 400 |
| Assignment | trùng (content, page) ⇒ 409 |
| RBAC | CONTENT sửa bài người khác ⇒ 403 · CONTENT set `status`/`isAds` ⇒ 403 · EDITOR vào `/users` ⇒ 403 |
| Crypto token | encrypt→decrypt round-trip · ciphertext hỏng ⇒ ném lỗi |
| Publisher | ảnh · video · lỗi FB ⇒ job FAILED + `errorMessage` |
| Drive adapter | upload trả `fileId` · stream download |

## Frontend

MVP: chỉ test `src/utils/` (permissions, formatters) và api layer bằng Vitest.
Không bắt buộc coverage 100% cho component.

## Khi test đỏ

Báo cáo nguyên văn output. Với **vùng bắt buộc** (auto-post, crypto, transition,
RBAC): không `it.skip`, không thêm vào loại trừ để né test — sửa cho xanh. Với các
vùng không bắt buộc thì đơn giản là chưa cần test, không phải "làm xanh bằng mẹo".
