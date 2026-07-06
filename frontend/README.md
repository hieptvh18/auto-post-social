# Social Publish Admin — Frontend

UI preview với **mock data** — chưa kết nối backend.

## Chạy local

```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173

## Đăng nhập demo

Trang login có 4 nút chọn nhanh role:

| Role | Menu hiển thị |
|------|----------------|
| **ADMIN** | Tất cả pages |
| **CONTENT** | Dashboard, Content Library |
| **PUBLISHER** | Dashboard, Content (read), Scheduler, Queue, Failed |
| **VIEWER** | Dashboard, Content, Scheduler, Queue, Failed (read-only) |

Mật khẩu bất kỳ — chỉ cần chọn email + role.

## Các trang

- `/dashboard` — Thống kê + biểu đồ
- `/content` — Content Library (search, filter, approve, sync)
- `/scheduler` — Lịch đăng bài (calendar timeline)
- `/queue` — Queue Monitor
- `/failed` — Failed Jobs (retry, xem lỗi)
- `/pages` — Facebook Pages (ADMIN)
- `/users` — User Management (ADMIN)
- `/audit` — Audit Logs (ADMIN)

## Stack

- React 19 + TypeScript + Vite
- Ant Design 6
- React Router 7
- React Query (sẵn sàng cho API thật)
- Recharts (dashboard chart)
