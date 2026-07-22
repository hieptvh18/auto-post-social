# Rule 05 — Database & ERD (BẮT BUỘC)

## Quy tắc cốt lõi

**Mỗi khi tạo mới hoặc thay đổi schema/table/column/enum/index/quan hệ, PHẢI cập
nhật [`erd.md`](../../erd.md) ngay trong cùng thay đổi đó.**

`erd.md` viết bằng **mermaid** (`erDiagram`). Đây là bản đồ dữ liệu chính thức của
dự án — không được để lệch với `prisma/schema.prisma`.

## Quy trình khi động vào schema

```text
1. Sửa backend/prisma/schema.prisma
2. Cập nhật erd.md   ← KHÔNG ĐƯỢC BỎ QUA
3. npx prisma migrate dev --name <mô-tả-ngắn>
4. Chạy test liên quan
5. Ghi vào contexts.md nếu là thay đổi đáng kể
```

Thứ tự 1→2 là bắt buộc: viết migration mà quên ERD ⇒ coi như task **chưa Done**.

## Yêu cầu nội dung `erd.md`

1. Một khối ```mermaid ... erDiagram``` chứa **toàn bộ** bảng và quan hệ.
2. Mỗi bảng liệt kê đầy đủ cột: `<type> <tên_cột_snake_case> <PK|FK|UK>`.
   Dùng **tên cột trong DB** (snake_case), không dùng tên field Prisma.
3. Quan hệ dùng ký hiệu chuẩn: `||--o{`, `||--||`, `}o--o{`, kèm nhãn động từ.
4. Sau sơ đồ phải có:
   - **Bảng Enum** — mọi enum và giá trị.
   - **Bảng Index** — index/unique constraint kèm lý do tồn tại.
   - **Ghi chú ràng buộc** — rule nghiệp vụ mà sơ đồ không diễn tả được
     (vd: UNIQUE(content, page) = mỗi bài chỉ đăng 1 lần trên 1 page).
   - **Lịch sử thay đổi** — ngày · migration · nội dung.
5. Đầu file ghi ngày cập nhật và migration mới nhất tương ứng.

## Kiểm tra trước khi báo Done

- [ ] Số bảng trong `erd.md` == số model trong `schema.prisma`
- [ ] Cột mới/xóa đã phản ánh đúng
- [ ] Index/unique mới đã có trong bảng Index kèm lý do
- [ ] Enum mới/giá trị mới đã có
- [ ] Đã thêm dòng vào Lịch sử thay đổi
- [ ] Cú pháp mermaid render được (không lỗi ký tự lạ trong tên/nhãn)

## Cấm

- Cấm sửa migration đã commit — luôn tạo migration mới.
- Cấm để `erd.md` "cập nhật sau" — không có ngoại lệ, kể cả thay đổi 1 cột.
- Cấm sinh `erd.md` bằng cách dán nguyên `schema.prisma` — ERD là mermaid, có enum,
  index và ghi chú ràng buộc.
