# Rule 04 — Env & cấu hình

## Nguyên tắc

1. **Mọi key/secret/URL đều nằm trong file `.env`.** Cấm hardcode trong source,
   cấm đọc `process.env` rải rác giữa business logic.
2. **Backend và frontend có bộ env riêng biệt.** Không dùng chung 1 file ở root.
3. Mỗi `.env` luôn đi kèm một `.env.example` cùng thư mục, **cùng danh sách key**,
   giá trị là placeholder rỗng hoặc giá trị dev an toàn.
4. `.env` bị gitignore. `.env.example` **phải** commit.
5. Thêm/đổi/xóa một key ⇒ cập nhật `.env.example` **trong cùng commit**. Đây là
   điều kiện Done của module.

## Vị trí file

```text
tool-auto-fb/
├── backend/.env            (gitignored)
├── backend/.env.example    (committed)
├── frontend/.env           (gitignored)
├── frontend/.env.example   (committed)
└── docker/.env             (gitignored — chỉ biến cho compose: cổng, mật khẩu db)
    docker/.env.example     (committed)
```

## Backend — cách dùng

- `ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate })`.
- **Validate lúc khởi động** bằng schema (`class-validator` hoặc `zod`) trong
  `src/config/env.validation.ts`. Thiếu biến bắt buộc ⇒ app crash ngay, không
  chạy nửa vời.
- Truy cập qua config namespace có type (`src/config/*.config.ts`), ví dụ
  `this.config.get<DriveConfig>('drive')`. **Không** gọi `process.env` trong
  service/controller.
- Biến bắt buộc: xem `docs/00-overview.md` §8. Bổ sung cho MVP:
  `GOOGLE_DRIVE_FOLDER_ID`, `TOKEN_ENCRYPTION_KEY` (32 byte hex).
  Không còn driver `fake` — Drive/Facebook luôn gọi API thật (bỏ ADR-003,
  xem quyết định 2026-07-24 trong `contexts.md`).

## Frontend — cách dùng

- Vite chỉ expose biến có tiền tố `VITE_`. Đọc qua `import.meta.env`.
- Gom toàn bộ vào `src/config/env.ts` export một object đã type; component và
  api layer chỉ import từ đó.
- **Cấm để secret trong frontend env** — mọi thứ ở đây là public sau khi build.
  Chỉ chứa: `VITE_API_BASE_URL`, `VITE_USE_MOCK`, cờ UI.

## Bảo mật

- Không log giá trị env. Pino redact: `password`, `token`, `accessToken`,
  `accessTokenEnc`, `authorization`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Service-account JSON của Google: truyền qua đường dẫn file hoặc base64 trong env,
  **không** commit file JSON vào repo.
- Không in `.env` ra terminal khi debug.
