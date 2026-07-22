# Tool Auto FB — Hướng dẫn cho Claude

Nền tảng quản lý content + Bot tự động đăng bài Facebook Page.
Stack: NestJS · Prisma · PostgreSQL · BullMQ/Redis · React + Ant Design.

## Đọc gì trước khi làm bất cứ việc gì

1. **[contexts.md](./contexts.md)** — trạng thái hiện tại của dự án. **Luôn đọc đầu session.**
2. **[PLAN-MVP.md](./PLAN-MVP.md)** — bản đồ milestone, trỏ tới file plan từng feature.
3. **[plans/](./plans/)** — mỗi feature một file plan. Đọc file của feature đang làm.
4. **[docs/](./docs/)** — spec cố định (chỉ đọc file liên quan, **không sửa** khi đang code).

## Rules bắt buộc tuân thủ

| File | Nội dung |
|------|----------|
| [.claude/rules/00-workflow.md](./.claude/rules/00-workflow.md) | Vòng đời task, định nghĩa Done |
| [.claude/rules/01-coding-standards.md](./.claude/rules/01-coding-standards.md) | Kiến trúc, naming, error, security |
| [.claude/rules/02-testing.md](./.claude/rules/02-testing.md) | **Coverage 100% service/domain** |
| [.claude/rules/03-context-protocol.md](./.claude/rules/03-context-protocol.md) | Cách ghi contexts.md & quản lý plan |
| [.claude/rules/04-env-config.md](./.claude/rules/04-env-config.md) | `.env` / `.env.example` cho BE & FE |
| [.claude/rules/05-database-erd.md](./.claude/rules/05-database-erd.md) | **Đổi schema ⇒ bắt buộc cập nhật [erd.md](./erd.md)** |

## Sáu điều dễ sai nhất

1. Code xong **phải** viết unit test tới 100% coverage service/domain — không hạ ngưỡng.
2. Xong module **phải** cập nhật `contexts.md` và tick file plan.
3. **Đụng vào schema/table ⇒ cập nhật `erd.md` (mermaid) ngay trong cùng thay đổi.**
4. Controller không gọi Prisma; service không gọi Prisma trực tiếp — luôn qua repository.
5. Key/secret chỉ nằm trong `.env`; thêm key mới phải cập nhật `.env.example` cùng commit.
6. `PUBLISHING`/`PUBLISHED` chỉ Bot được set — chặn ở service, không role nào set tay.

## Lệnh

```bash
# backend/
npm run lint && npm run test:cov && npm run build
npm run prisma:migrate && npm run seed

# frontend/
npm run lint && npm run build
```
