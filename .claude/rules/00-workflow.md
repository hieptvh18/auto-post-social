# Rule 00 — Quy trình làm việc

## Vòng đời một task

```text
1. ĐỌC   contexts.md + PLAN-MVP.md + docs/ liên quan
2. CHỐT  phạm vi task = đúng 1 module hoặc 1 milestone con
3. CODE  theo 01-coding-standards.md
4. TEST  viết unit test cho tới khi coverage service/domain = 100% (02-testing.md)
5. VERIFY chạy: npm run lint && npm run test:cov && npm run build
6. GHI   cập nhật contexts.md (03-context-protocol.md)
```

Không được chuyển sang bước sau khi bước trước còn đỏ.

## Nguyên tắc bất di bất dịch

1. **`docs/` là spec, không sửa khi đang code.** Nếu phát hiện docs sai/thiếu, dừng
   lại, báo user, ghi vào mục "Nợ kỹ thuật" của `contexts.md`. Không tự ý đổi spec.
2. **Không code vượt scope MVP** khai báo ở `contexts.md` §2. Ý tưởng ngoài scope →
   ghi vào §6, không implement.
3. **Một module = một lần giao.** Không mở 3 module dở dang cùng lúc.
4. **Không đánh dấu ✅ khi test chưa xanh.** Báo cáo trung thực: test đỏ thì nói
   test đỏ, kèm output.
5. **Migration là bất biến.** Đã `prisma migrate dev` và commit thì không sửa file
   migration cũ — tạo migration mới.
6. **Secret chỉ qua env.** Không hardcode, không commit `.env`. Mỗi biến mới phải
   thêm vào `.env.example` cùng lúc.

## Định nghĩa "Done" của một module

- [ ] Đủ file theo checklist `01-coding-standards.md` §Cấu trúc module
- [ ] DTO validate mọi input; Swagger decorator đầy đủ
- [ ] Guard + permission đúng ma trận `docs/05-rbac.md`
- [ ] Unit test: service/domain 100% statements + branches
- [ ] `npm run lint` sạch, `npm run build` pass
- [ ] `contexts.md` đã cập nhật (§4 milestone, §5 nhật ký)

## Lệnh chuẩn (backend)

```bash
npm run lint          # eslint
npm run test          # jest unit
npm run test:cov      # jest + coverage threshold (fail nếu <100% service/domain)
npm run build         # nest build
npm run prisma:migrate # prisma migrate dev
npm run seed          # seed admin
```
