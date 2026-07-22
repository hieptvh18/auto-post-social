# Rule 02 — Testing

## Cam kết coverage

**100% statements + branches + functions + lines** cho tầng service/domain.
Đây là ngưỡng cứng trong `jest.config.ts`, CI/lệnh `test:cov` fail nếu không đạt.

### Phạm vi tính coverage

**Tính (bắt buộc 100%):**
- `src/modules/**/*.service.ts`
- `src/common/guards/**`, `src/common/decorators/**` (có logic), `src/common/utils/**`
- `src/modules/auto-post/**` — đặc biệt scheduler + picker
- `src/infra/**/*.ts` (adapter, crypto) trừ client HTTP thuần

**Loại trừ (khai trong `coveragePathIgnorePatterns`):**
- `*.module.ts`, `*.controller.ts`, `dto/**`, `*.entity.ts`
- `main.ts`, `prisma/**`, `**/__tests__/**`, `**/*.spec.ts`
- `src/config/**` (chỉ khai báo)

Controller được đảm bảo bằng e2e/smoke test, không bằng coverage.

```typescript
// jest.config.ts
coverageThreshold: {
  global: { statements: 100, branches: 100, functions: 100, lines: 100 },
}
```

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

Không được đạt 100% bằng cách viết test rỗng. Các nhánh sau phải có test **đúng hành vi**:

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

Báo cáo nguyên văn output. **Không** hạ ngưỡng coverage, không thêm file vào danh
sách loại trừ, không `it.skip` để làm xanh CI. Nếu ngưỡng thực sự bất hợp lý,
dừng và hỏi user.
