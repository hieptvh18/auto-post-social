# Rule 01 — Chuẩn code

## Backend (NestJS + Prisma)

### Luồng phụ thuộc — một chiều, không ngoại lệ

```text
Controller → Service → Repository → PrismaService
                    → Adapter (GoogleDrive, FacebookGraph)
```

- Controller **không** import `PrismaService`, không chứa business logic.
  Nhiệm vụ: nhận DTO, gọi 1 method service, trả kết quả.
- Service **không** import `PrismaClient` trực tiếp — chỉ qua repository.
- Repository là nơi duy nhất viết Prisma query. Trả về entity/plain object,
  không trả Prisma type ra ngoài nếu tránh được.
- External API (Drive, Meta) luôn nằm sau interface trong `infra/`. Không còn
  driver fake — luôn gọi API thật (bỏ ADR-003, xem `contexts.md` 2026-07-24).

### Cấu trúc module

```text
src/modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts      # thin + @ApiTags/@ApiOperation
├── <feature>.service.ts         # business logic — test khi logic phức tạp (rule 02)
├── <feature>.repository.ts      # Prisma queries
├── dto/
│   ├── create-<x>.dto.ts
│   ├── update-<x>.dto.ts
│   └── query-<x>.dto.ts
└── __tests__/
    └── <feature>.service.spec.ts
```

### Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|------|---------|-------|
| File | kebab-case | `content-assets.service.ts` |
| Class | PascalCase | `ContentAssetsService` |
| Biến/hàm | camelCase | `pickContentForSlot` |
| Hằng | UPPER_SNAKE | `PERMISSIONS_KEY` |
| DB column | snake_case qua `@map` | `drive_file_id` |
| API field | camelCase | `driveFileId` |
| Enum value | theo `docs/03` | `PENDING_REVIEW` |

### TypeScript

- `strict: true`. **Cấm `any`** — dùng `unknown` + narrow, hoặc khai type thật.
- Cấm non-null assertion `!` trừ khi ngay trên đó có guard rõ ràng.
- Return type tường minh cho mọi public method của service/repository.
- Không `export default`.

### DTO & validation

- Mọi input qua `class-validator`; bật `ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true, transform: true })` toàn cục.
- Field optional trong PATCH dùng `@IsOptional()`, không dùng `?? undefined` ở service.
- Ràng buộc nghiệp vụ chéo field (vd REJECTED bắt buộc `rejectComment`) kiểm ở
  **service**, không ở DTO — vì cần đọc state hiện tại trong DB.

### Lỗi

Dùng đúng exception theo `docs/02-architecture.md` §7.1:

| Tình huống | Exception |
|-----------|-----------|
| Input sai | `BadRequestException` (400) |
| Chưa đăng nhập | `UnauthorizedException` (401) |
| Sai quyền | `ForbiddenException` (403) |
| Không tìm thấy | `NotFoundException` (404) |
| Vi phạm rule (trùng assignment) | `ConflictException` (409) |
| Chuyển trạng thái sai | `UnprocessableEntityException` (422) |

Lỗi từ external API phải wrap thành domain error, log nguyên response gốc,
**không** ném thẳng axios error ra controller.

### Bảo mật

- Token FB: encrypt AES-256-GCM bằng `TOKEN_ENCRYPTION_KEY`, format
  `iv:authTag:ciphertext` base64. Chỉ decrypt tại thời điểm publish.
- API trả về page: **mask token** (4 ký tự cuối).
- Không log token, password, service-account JSON. Pino redact các key này.
- Password: bcrypt cost 12.

### Log

Pino, structured, kèm `correlationId`, `userId` (null khi actor = Bot),
`contentId`/`publishJobId`/`slotId` khi có. Không log object Prisma nguyên khối.

### Thời gian

- **DB lưu UTC.** Slot `time` là chuỗi `'HH:mm'` hiểu theo `Asia/Ho_Chi_Minh`.
- Mọi so sánh giờ cron dùng dayjs + plugin timezone, không dùng `new Date()` trần.
- Trong test, **luôn** inject/fake clock — cấm test phụ thuộc giờ chạy thật.

---

## Frontend (React + Ant Design)

- Gọi API qua `src/api/<feature>.api.ts`, dữ liệu qua React Query hook
  `src/hooks/use<Feature>.ts`. Component không gọi `fetch`/axios trực tiếp.
- Giữ `MockDataContext` sau cờ `VITE_USE_MOCK` (ADR-005) — không xóa.
- Type API dùng chung đặt tại `src/types/`, phản chiếu đúng response backend.
- Không tự chế component đã có trong Ant Design.
- Mọi mutation phải `invalidateQueries` key liên quan.

---

## Git

- Commit theo Conventional Commits: `feat(auto-post): ...`, `fix(worker): ...`,
  `test(content): ...`, `chore(db): ...`.
- Một commit = một đơn vị logic chạy được. Không commit code không build.
- Không commit khi user chưa yêu cầu.
