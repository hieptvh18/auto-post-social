# Rule 03 — Giao thức context & plan

## Ba loại tài liệu sống

| File | Vai trò | Khi nào ghi |
|------|---------|-------------|
| `contexts.md` | Trạng thái **hiện tại** của dự án — ai đọc cũng hiểu ngay đang ở đâu | Cuối mỗi module & cuối mỗi session |
| `plans/<feat>.md` | Kế hoạch **một feature** — task list, thiết kế, tiến độ | Trước khi code feature đó; tick trong lúc làm |
| `PLAN-MVP.md` | Bản đồ tổng — thứ tự milestone, trỏ tới các file plan | Khi đổi phạm vi/thứ tự |

`docs/` là **spec cố định**, không phải tài liệu sống. Không sửa khi đang code.

---

## Đầu mỗi session — BẮT BUỘC

1. Đọc `contexts.md` (toàn bộ).
2. Đọc `PLAN-MVP.md` để biết milestone kế tiếp.
3. Đọc `plans/<feature>.md` của feature sắp làm.
4. Chỉ đọc file trong `docs/` thực sự liên quan tới feature đó.

Không bắt đầu code trước khi làm xong 4 bước trên.

---

## Quản lý plan theo feature

### Cấu trúc

```text
plans/
├── _TEMPLATE.md              # mẫu, copy khi mở feature mới
├── 01-scaffold.md
├── 02-auth-rbac.md
├── 03-google-drive-upload.md
├── ...
└── DONE/                     # feature đã xong thì chuyển file vào đây
```

### Quy tắc

- **Một feature = một file plan.** Đặt tên `NN-<kebab-case>.md`, `NN` là thứ tự
  thực hiện.
- File plan phải viết **trước khi** code dòng đầu tiên của feature.
- Trong lúc làm: tick `- [x]` từng task ngay khi xong, không dồn tick cuối buổi.
- Feature xong (test xanh + coverage đạt): điền mục "Kết quả", `git mv` file sang
  `plans/DONE/`, cập nhật `contexts.md`.
- Phát sinh việc ngoài dự kiến: thêm task vào chính file plan đó và ghi 1 dòng
  lý do — không âm thầm làm thêm.
- Việc thuộc feature khác: ghi vào file plan của feature đó, hoặc vào §6
  `contexts.md` nếu chưa có plan.

### Mẫu file plan

Xem `plans/_TEMPLATE.md`.

---

## Cập nhật `contexts.md`

### Thời điểm

- Ngay sau khi một module/feature đạt Done.
- Cuối mỗi session, kể cả khi việc còn dở.
- Khi có quyết định kiến trúc mới (thêm ADR).

### Nội dung phải cập nhật

1. Dòng "Cập nhật lần cuối" + "Session gần nhất".
2. §1 bảng hiện trạng, §4 bảng milestone (đổi ký hiệu, điền ngày).
3. §5 thêm mục nhật ký theo mẫu dưới.
4. §6 việc dở: ghi **chính xác** đang dừng ở đâu, file nào, còn thiếu gì.
5. §7 cạm bẫy: lỗi nào tốn >15 phút thì ghi lại cách xử lý.
6. §3 nếu có ADR mới.

### Mẫu mục nhật ký (§5)

```markdown
### <Tên module> — ✅ YYYY-MM-DD

- **Phạm vi:** làm được gì, endpoint nào
- **File chính:** `backend/src/modules/x/x.service.ts`, ...
- **Quyết định:** khác spec chỗ nào, vì sao
- **Test:** N test, coverage service 100%
- **Còn nợ:** ... (hoặc "không")
```

### Kỷ luật

- Viết cho **người chưa biết gì** đọc, không viết cho chính mình.
- Ghi sự thật: chưa test thì ghi "chưa test". Cấm đánh dấu ✅ khi test đỏ.
- Ngắn gọn — mỗi module tối đa ~10 dòng. `contexts.md` là bản đồ, không phải nhật ký chi tiết.
- Không copy code vào `contexts.md`; chỉ trỏ đường dẫn file.
