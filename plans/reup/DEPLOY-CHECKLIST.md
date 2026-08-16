# Checklist deploy tính năng Reup lên server

> Trạng thái lúc viết: **code đã xong plan 26-30 tại local, CHƯA push** (xem
> [TONG-QUAN.md](./TONG-QUAN.md) §3). Plan 31/33 chưa code — không có gì để deploy cho
> 2 plan đó. Plan 32 code xong nhưng không cần thao tác deploy thêm (không có migration,
> không có env mới — dùng `app_settings` có sẵn).
>
> Server tham chiếu theo [`DEPLOY-VPS-NO-DOCKER.md`](../../DEPLOY-VPS-NO-DOCKER.md)
> (1 process PM2 `tool-auto-fb-api`, `instances: 1`, Postgres + Redis có sẵn trên VPS).

---

## 0. Việc phải sửa TRƯỚC KHI push (đang thiếu, phát hiện khi soát code)

- [ ] **`backend/.env.production.example` chưa được cập nhật** — diff hiện tại chỉ có
      `backend/.env.example` đổi, file mẫu production **chưa có** 3 biến
      `SEED_SUPER_ADMIN_*` và 5 biến `REUP_*`/`API_GG_CLOUD_YOUTOBE_V3`. Đây là vi phạm
      rule 04 ("thêm key mới ⇒ cập nhật `.env.example` **và** file mẫu production cùng
      commit"). Copy đúng khối đã thêm ở `backend/.env.example` sang file này trước khi
      commit.
- [ ] `.env.example` hiện thiếu dòng trống cuối file (no newline at EOF) — sửa cho sạch,
      không bắt buộc nhưng nên làm cùng lúc.
- [ ] Chạy lại `cd backend && npm run lint && npm run build && npm run test` — xác nhận
      xanh trước khi commit (rule 00 §Vòng đời task, bước 5).
- [ ] `cd frontend && npm run lint && npm run build` — xanh.
- [ ] Rà `git status` — xác nhận thư mục `ai-video-downloader/` là **project Python
      độc lập**, không phải thuộc `tool-auto-fb`. **Không add/commit thư mục này** vào
      repo (đây là dependency triển khai riêng trên server, xem §3). Nếu vô tình
      `git add -A` sẽ kéo theo `.venv/` (build Python nặng) vào commit.

## 1. Commit + push

```bash
# tại root repo
git add PLAN-MVP.md backend/ frontend/ contexts.md docs/05-rbac.md erd.md plans/
# KHÔNG add ai-video-downloader/ (§0)
git status   # soát lại danh sách trước khi commit
git commit -m "feat(reup): pipeline reup tự động (plan 26-30)"
git push origin main   # hoặc đúng nhánh đang dùng
```

## 2. Trên server — pull code + migrate + build

```bash
cd /var/www/tool-auto-fb
git pull

cd backend
npm ci
npx prisma migrate deploy      # áp 2 migration mới, KHÔNG dùng migrate dev
```

2 migration sẽ được áp (theo đúng thứ tự, đã nằm sẵn trong repo):
- `20260815000000_add_super_admin_role` — thêm enum `SUPER_ADMIN`
- `20260815010000_reup_topics_videos_runs` — 3 bảng `reup_topics/videos/runs` + 2 cột
  trên `content_assets` + cột `quota_used`/`reup_video_id` gộp sẵn cho plan 29

```bash
npm run build
```

**Chưa restart PM2 ở bước này** — cần điền `.env` trước (§3), restart 1 lần ở cuối §4.

## 3. Cấu hình `.env` trên server (backend/.env)

Điền theo mẫu đã cập nhật ở `.env.production.example` (§0). Nhóm biến mới:

```bash
# ── Seed SUPER_ADMIN — chỉ cần lúc chạy `npm run seed`, không phải lúc app chạy ──
SEED_SUPER_ADMIN_EMAIL=<email thật>
SEED_SUPER_ADMIN_PASSWORD=<mật khẩu mạnh, tự đặt>
SEED_SUPER_ADMIN_NAME=Super Admin

# ── Reup: cầu nối ai-video-downloader — TẤT CẢ OPTIONAL (QĐ-6) ──
# Để trống nếu server CHƯA có/CHƯA cần tính năng reup ngay — app vẫn chạy bình
# thường, chỉ riêng reup tự tắt (SKIPPED/DOWNLOADER_UNAVAILABLE).
REUP_PYTHON_BIN=/đường/dẫn/ai-video-downloader/backend/.venv/bin/python3
REUP_PROJECT_DIR=/đường/dẫn/ai-video-downloader
REUP_TMP_DIR=/data/reup-tmp          # để trống = dùng thư mục tmp của OS
REUP_DOWNLOAD_TIMEOUT_MS=600000

# ── API key YouTube — CÓ 2 CÁCH, chọn 1 ──
# Cách 1 (khuyến nghị): để TRỐNG biến này, cấu hình key qua UI sau khi đăng nhập
# SUPER_ADMIN → /reup → tab cấu hình YouTube. Key mã hoá AES-256-GCM trong DB,
# đổi được không cần restart (ADR-014).
# Cách 2 (fallback nhanh khi test): điền thẳng ở đây.
API_GG_CLOUD_YOUTOBE_V3=
```

Việc cần làm:

- [ ] `chmod 600 backend/.env` vẫn giữ nguyên (không đổi quyền file).
- [ ] Nếu **chưa** muốn bật reup ngay trên server này: để nguyên 4 biến `REUP_*` và
      `API_GG_CLOUD_YOUTOBE_V3` **trống** — app vẫn boot và mọi tính năng khác không
      ảnh hưởng (đã kiểm chứng ở plan 28 §5, "đo thật").

## 4. Seed user SUPER_ADMIN (bắt buộc — nếu chưa có ai vào được `/reup`)

```bash
cd backend
npm run seed
```

- [ ] Idempotent — chạy lại không tạo trùng, không log mật khẩu ra terminal.
- [ ] Nếu server **đã seed trước đó** (đã chạy plan 26 lần trước), lệnh này chỉ in
      "đã tồn tại — bỏ qua", an toàn chạy lại.

## 5. (Tuỳ chọn, chỉ khi muốn bật cron reup thật) — cài `ai-video-downloader` trên server

Đây là **project Python riêng**, không nằm trong repo `tool-auto-fb`. Copy/clone lên
server rồi trỏ `REUP_PYTHON_BIN`/`REUP_PROJECT_DIR` ở §3 vào đó.

```bash
# ví dụ đặt cạnh tool-auto-fb, KHÔNG trong thư mục repo
cd /var/www
git clone <repo-ai-video-downloader> ai-video-downloader   # hoặc rsync từ máy dev
cd ai-video-downloader/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # có aiohttp, yt-dlp, ...
.venv/bin/yt-dlp --version                  # xác nhận binary chạy được
```

- [ ] Server cần Python ≥ bản dùng ở máy dev (venv local đang chạy `python3.14` —
      kiểm tra `.python-version`/`pyproject.toml` của project đó để chọn đúng bản trên
      server, không nhất thiết phải trùng tuyệt đối nhưng nên ≥ 3.11).
- [ ] `yt-dlp` cần mạng ra ngoài tới YouTube — nếu VPS có firewall egress, mở port 443
      outbound.
- [ ] Không cần cài `playwright`/`faster-whisper` (dùng cho tính năng lồng tiếng, ngoài
      phạm vi reup — xem `requirements.txt` gốc) nếu muốn venv gọn, nhưng cài đủ theo
      `requirements.txt` là an toàn nhất, tránh lệch môi trường với máy dev.

## 6. Restart + kiểm tra

```bash
pm2 restart tool-auto-fb-api
pm2 logs tool-auto-fb-api --lines 80
```

Soát log lúc boot:

- [ ] **0 lỗi**, app khởi động đủ module (`ReupModule`, `ReupDownloaderModule`,
      `ReupMediaHookModule`).
- [ ] **Không có dòng nào kiểm tra downloader lúc boot** (đúng QĐ-6) — nếu thấy lỗi
      liên quan `REUP_PYTHON_BIN` ngay lúc start, có bug hồi quy, phải dừng lại tra.
- [ ] `pm2 list` → đúng **1** instance, `exec_mode: fork` (không phải `cluster`) — sai
      chỗ này gây đăng trùng bài lên Page thật, không riêng gì reup.

## 7. Kiểm tra tay trên server thật (theo đúng phần "còn nợ" của từng plan)

- [ ] Đăng nhập bằng tài khoản `SEED_SUPER_ADMIN_EMAIL` → thấy menu **Reup Setting**.
- [ ] Tài khoản ADMIN cũ đăng nhập → **không** thấy menu Reup, mọi tính năng khác y
      như trước (chống hồi quy — plan 26 §5 chưa bấm tay được mục này).
- [ ] Vào `/reup` → tạo 1 chủ đề test (quota thấp, vd 1) → nếu đã cấu hình
      `REUP_PYTHON_BIN` + API key: bấm **"Quét ngay"** → theo dõi `/reup/runs` và
      `/reup` tab Video đã kéo.
- [ ] Nếu **chưa** cấu hình downloader: xác nhận UI hiện banner báo thiếu cấu hình
      (không phải lỗi 500 trắng trang).
- [ ] `GET /api/reup/health` (Swagger hoặc curl có Bearer token SUPER_ADMIN) → trả
      `available` đúng theo trạng thái cấu hình.

## 8. Rollback nếu có sự cố

- Migration **không tự rollback** — Prisma không có lệnh downgrade tự động. Nếu phải
  lùi code: `git revert`/`checkout` về commit cũ, `npm run build`, `pm2 restart`, nhưng
  **giữ nguyên schema DB** (2 migration mới không phá dữ liệu cũ — cột mới đều có
  default/nullable, bảng mới không ai đọc nếu code cũ không biết tới chúng). Không cần
  chạy `migrate reset`.
- Nếu muốn tắt hẳn reup mà không rollback code: xoá/để trống `REUP_PYTHON_BIN` trong
  `.env` rồi `pm2 restart` — cron tự `SKIPPED`, không ảnh hưởng phần còn lại (QĐ-6).

---

**Không nằm trong checklist này** (chưa code, không có gì để deploy): plan 31 (audit
log reup), plan 33 (gộp Queue Monitor). Khi 2 plan đó xong, thêm mục riêng — dự kiến
không có migration/env mới (plan 31 dùng `audit_logs` có sẵn; plan 33 chỉ thêm
endpoint đọc).
