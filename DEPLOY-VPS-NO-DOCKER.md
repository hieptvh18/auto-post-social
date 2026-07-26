# Hướng dẫn deploy VPS — KHÔNG dùng Docker

> Áp dụng cho VPS Linux (Ubuntu 22.04+) **đã có sẵn PostgreSQL (:5432) và Redis (:6379)**
> đang phục vụ dự án khác. Tài liệu này thay thế `docs/09-deployment.md` (bản đó viết
> cho Docker Compose) cho tình huống bare-metal.
>
> Cập nhật: 2026-07-26

---

## 0. Kiến trúc mục tiêu

```text
Internet
   │  :443 / :80
┌──▼──────────────────────────────────────────────┐
│ Nginx                                            │
│  ├── /            → /var/www/tool-auto-fb (FE build tĩnh)
│  └── /api         → proxy_pass 127.0.0.1:3001   │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──────────────────────────┐
│ Node process (PM2)          │  ← API + Cron auto-post + BullMQ worker
│ backend/dist/main.js :3001  │    CÙNG 1 process (ADR-002)
└──┬───────────────────┬──────┘
   │                   │
┌──▼─────────┐   ┌─────▼──────────────────┐
│ PostgreSQL │   │ Redis (dùng chung)     │
│ :5432      │   │ :6379 — DB index riêng │
│ DB riêng   │   │ + key prefix riêng     │
└────────────┘   └────────────────────────┘
```

Điểm bắt buộc nhớ:

- **Chỉ chạy 1 instance backend.** Cron auto-post nằm trong cùng process API
  (ADR-002). Bật PM2 `cluster` với `instances: 2` ⇒ 2 tiến trình cùng bắn cron
  ⇒ nguy cơ đăng trùng lên Page thật. Luôn `instances: 1`, `exec_mode: fork`.
- Frontend là **static build**, không cần Node chạy. Nginx serve thẳng `dist/`.
- Không có service `worker` riêng ở MVP.

---

## 1. Trả lời câu hỏi: Redis có nên tách riêng cho từng dự án?

**Ngắn gọn: dùng chung instance được, NHƯNG phải kiểm tra `maxmemory-policy` trước.
Nếu policy không phải `noeviction` thì BẮT BUỘC tách instance riêng.**

### 1.1 Vì sao

BullMQ lưu job (dữ liệu bài chuẩn bị đăng) trong Redis như dữ liệu **bền**, không
phải cache. Nếu instance Redis đang được dự án kia dùng làm cache và đặt:

```
maxmemory-policy allkeys-lru   # hoặc allkeys-random / volatile-*
```

thì khi Redis đầy bộ nhớ, nó sẽ **âm thầm xoá key của BullMQ** ⇒ job biến mất,
bài không được đăng, và **không có log lỗi nào** ở phía app. Đây là kiểu lỗi mất
nhiều ngày mới truy ra.

Kiểm tra ngay trên VPS:

```bash
redis-cli config get maxmemory-policy
redis-cli config get maxmemory
redis-cli info persistence | grep -E 'aof_enabled|rdb_last_bgsave_status'
```

| Kết quả | Kết luận |
|---------|----------|
| `noeviction` (mặc định) + có AOF/RDB | **Dùng chung được** — chỉ cần cách ly bằng DB index + key prefix (mục 1.2) |
| `allkeys-*` hoặc `volatile-*` | **Tách instance riêng** (mục 1.3). Không thương lượng. |
| `maxmemory 0` (không giới hạn) | Dùng chung được, nhưng nên đặt giới hạn + `noeviction` |

### 1.2 Cách ly khi dùng chung (khuyến nghị cho MVP)

Ba lớp cách ly, làm cả ba:

1. **Redis DB index riêng** — dự án khác thường ở `db 0`; tool này dùng `db 3`
   (số nào cũng được, miễn khác). `FLUSHDB` của dự án kia sẽ không đụng dữ liệu này.
2. **Key prefix riêng cho BullMQ** — `tool-auto-fb` thay vì `bull` mặc định.
   Tránh đụng tên queue nếu dự án kia cũng xài BullMQ.
3. **ACL user riêng** (nếu Redis ≥ 6, tuỳ chọn nhưng nên làm) — giới hạn user chỉ
   được đụng key theo prefix.

```bash
# Trên VPS, tạo user riêng (Redis 6+)
redis-cli ACL SETUSER toolautofb on '>MAT_KHAU_MANH' '~tool-auto-fb:*' '~bull:tool-auto-fb:*' +@all -@dangerous
redis-cli ACL SAVE
```

> Lưu ý: các lệnh này **không** làm `FLUSHALL` của dự án kia trở nên vô hại —
> `FLUSHALL` xoá mọi DB index. Nếu đội kia có thói quen `FLUSHALL`, hãy tách hẳn.

### 1.3 Khi nào tách hẳn instance riêng

Tách nếu **bất kỳ** điều nào đúng:

- `maxmemory-policy` không phải `noeviction`.
- Dự án kia có script `FLUSHALL` / `redis-cli -n <db> FLUSHDB` chạy tự động.
- Dự án kia tải nặng, có lệnh block (`KEYS *`, Lua dài) — Redis single-thread,
  một lệnh chậm làm job đăng bài trễ theo.
- Bạn cần persistence khác (BullMQ nên bật AOF `appendfsync everysec`).

Cách tách nhanh — chạy thêm 1 instance systemd trên port khác:

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis-toolautofb.conf
sudo nano /etc/redis/redis-toolautofb.conf
```

Sửa các dòng:

```conf
port 6380
bind 127.0.0.1 ::1
pidfile /var/run/redis/redis-toolautofb.pid
logfile /var/log/redis/redis-toolautofb.log
dir /var/lib/redis-toolautofb
dbfilename dump-toolautofb.rdb
appendonly yes
appendfsync everysec
maxmemory 512mb
maxmemory-policy noeviction
requirepass MAT_KHAU_MANH
```

```bash
sudo mkdir -p /var/lib/redis-toolautofb && sudo chown redis:redis /var/lib/redis-toolautofb
sudo systemctl enable --now redis-server@toolautofb   # hoặc tạo unit file riêng
redis-cli -p 6380 -a MAT_KHAU_MANH ping   # PONG
```

Rồi đặt `REDIS_PORT=6380` trong `backend/.env`.

---

## 2. ⚠️ Việc cần làm trước tiên: patch code Redis

**Code hiện tại chỉ đọc `REDIS_HOST` + `REDIS_PORT`** — chưa hỗ trợ `password`,
`db index`, `key prefix`. Redis trên VPS gần như chắc chắn có `requirepass`, và
cách ly ở mục 1.2 cần `db` + `prefix`. Vì vậy **phải bổ sung 3 biến env này vào
code trước khi deploy**, nếu không app sẽ `NOAUTH Authentication required`.

Các file cần sửa (đã khảo sát, đây là toàn bộ nơi chạm Redis):

| File | Sửa gì |
|------|--------|
| [backend/src/config/env.validation.ts](backend/src/config/env.validation.ts) | thêm `REDIS_PASSWORD?`, `REDIS_DB` (default 0), `REDIS_KEY_PREFIX` (default `bull`) |
| [backend/src/config/app-config.service.ts:44](backend/src/config/app-config.service.ts#L44) | getter `redis` trả thêm `password`, `db`, `keyPrefix` |
| [backend/src/app.module.ts:34-45](backend/src/app.module.ts#L34-L45) | `BullModule.forRootAsync` → thêm `password`, `db` vào `connection`, thêm `prefix` |
| [backend/src/infra/redis/redis.service.ts](backend/src/infra/redis/redis.service.ts) | `new Redis({ ..., password, db })` |
| [backend/.env.example](backend/.env.example) | thêm 3 key mới (rule 04 — cùng commit) |

Phác thảo thay đổi ở `app.module.ts`:

```ts
BullModule.forRootAsync({
  imports: [AppConfigModule],
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => ({
    // Prefix riêng để không đụng queue của dự án khác dùng chung Redis.
    prefix: config.redis.keyPrefix,
    connection: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: null, // BullMQ bắt buộc null
    },
  }),
}),
```

> Sau khi patch: `cd backend && npm run lint && npm run build && npm run test`.

---

## 3. Chuẩn bị VPS

### 3.1 Cài Node.js 22 LTS + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
node -v            # >= 22
sudo npm i -g pm2
```

`build-essential` cần cho `bcrypt` (native module) khi `npm ci`.

### 3.2 Tạo user hệ thống riêng cho app

```bash
sudo adduser --system --group --home /var/www/tool-auto-fb deploy
sudo mkdir -p /var/www/tool-auto-fb
sudo chown -R deploy:deploy /var/www/tool-auto-fb
```

### 3.3 Nginx + certbot

```bash
sudo apt-get install -y nginx
sudo apt-get install -y certbot python3-certbot-nginx
```

### 3.4 Timezone

DB lưu UTC, app so giờ slot bằng `dayjs` + `TZ_DISPLAY` (rule 01). Không cần đổi
timezone hệ điều hành. Nếu vẫn muốn cho log dễ đọc:

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
```

---

## 4. PostgreSQL — tạo database riêng

**Không dùng chung database với dự án khác.** Tạo role + DB riêng (schema `public`
riêng của DB đó):

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE toolautofb WITH LOGIN PASSWORD 'MAT_KHAU_DB_MANH';
CREATE DATABASE tool_auto_fb OWNER toolautofb ENCODING 'UTF8';
\c tool_auto_fb
-- Postgres 15+: public schema không cho phép role thường tạo bảng, phải cấp
GRANT ALL ON SCHEMA public TO toolautofb;
\q
```

Kiểm tra kết nối:

```bash
psql "postgresql://toolautofb:MAT_KHAU_DB_MANH@127.0.0.1:5432/tool_auto_fb" -c '\conninfo'
```

### Bảo mật

Đảm bảo Postgres **chỉ nghe localhost** (mặc định) — trong
`/etc/postgresql/16/main/postgresql.conf`:

```conf
listen_addresses = 'localhost'
```

Và `pg_hba.conf` dùng `scram-sha-256` cho `host … 127.0.0.1/32`.

> Không mở 5432 ra Internet. Nếu cần truy cập từ máy cá nhân, dùng SSH tunnel:
> `ssh -L 55432:127.0.0.1:5432 user@vps` rồi kết nối `localhost:55432`.

---

## 5. Lấy code lên VPS

```bash
sudo -u deploy -H bash
cd /var/www/tool-auto-fb
git clone <repo-url> .
```

---

## 6. Env backend (production)

```bash
cd /var/www/tool-auto-fb/backend
cp .env.example .env
chmod 600 .env
nano .env
```

Nội dung production (khác dev ở các dòng đánh dấu ★):

```dotenv
# ── App ──
NODE_ENV=production                                    # ★
PORT=3001
API_PREFIX=api
TZ_DISPLAY=Asia/Ho_Chi_Minh

# ── Database ── ★ port chuẩn 5432, không còn 55432 của Docker
DATABASE_URL=postgresql://toolautofb:MAT_KHAU_DB_MANH@127.0.0.1:5432/tool_auto_fb?schema=public

# ── Redis ── ★ port chuẩn 6379 (hoặc 6380 nếu tách instance riêng — mục 1.3)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=MAT_KHAU_REDIS       # ★ mới — cần patch mục 2
REDIS_DB=3                          # ★ mới — cách ly với dự án khác
REDIS_KEY_PREFIX=tool-auto-fb       # ★ mới — prefix key BullMQ

# ── JWT ── ★ sinh mới, KHÔNG dùng giá trị dev
JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<openssl rand -hex 48>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ── Mã hoá token FB + service account Drive ── ★
# Sinh: openssl rand -hex 32
# CẢNH BÁO: đổi key này ⇒ mọi access_token và Drive credential đã lưu trong DB
# không giải mã được, phải nhập lại ở /settings. BACKUP KEY NÀY.
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>

# ── URL ── ★ domain thật, dùng dựng redirect_uri OAuth Google Drive
APP_BASE_URL=https://tool.example.com
WEB_BASE_URL=https://tool.example.com

# ── Google Drive (chỉ là fallback bootstrap — cấu hình thật ở UI /settings) ──
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_DRIVE_FOLDER_ID=
MAX_UPLOAD_MB=200

# ── Meta Graph API ──
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0

# ── Auto-post ──
AUTOPOST_ENABLED=true
MAX_POST_PER_SLOT=20

# ── Monitor ──
MONITOR_STUCK_MINUTES=15
```

Sinh secret:

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY  ← backup riêng, mất là mất token
```

> `APP_BASE_URL` và `WEB_BASE_URL` **cùng domain** vì Nginx serve FE ở `/` và proxy
> BE ở `/api`. Nếu tách 2 domain thì điền khác nhau và mở CORS tương ứng.

---

## 7. Build & migrate backend

```bash
cd /var/www/tool-auto-fb/backend
npm ci
npx prisma generate
npx prisma migrate deploy      # ← KHÔNG dùng migrate dev trên production
npm run build
```

Seed tài khoản admin — **chỉ chạy lần đầu**:

```bash
npm run seed
# admin@company.local / ChangeMe123!  → ĐỔI MẬT KHẨU NGAY sau lần đăng nhập đầu
```

`prisma migrate deploy` chỉ áp dụng migration đã commit, không sinh migration mới,
không hỏi tương tác — đúng thứ cần cho production.

---

## 8. Chạy backend bằng PM2

Tạo `/var/www/tool-auto-fb/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'tool-auto-fb-api',
      cwd: '/var/www/tool-auto-fb/backend',
      script: 'dist/main.js',
      // BẮT BUỘC: 1 instance, fork mode.
      // Cron auto-post chạy trong cùng process (ADR-002) — nhiều instance ⇒
      // nhiều tick cùng slot ⇒ nguy cơ đăng trùng lên Page thật.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/tool-auto-fb/err.log',
      out_file: '/var/log/tool-auto-fb/out.log',
      time: true,
    },
  ],
};
```

```bash
sudo mkdir -p /var/log/tool-auto-fb && sudo chown deploy:deploy /var/log/tool-auto-fb
cd /var/www/tool-auto-fb
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u deploy --hp /var/www/tool-auto-fb   # chạy lệnh nó in ra bằng sudo
```

PM2 đọc `.env` qua `dotenv` của app (Nest `ConfigModule` với `envFilePath: '.env'`
+ `cwd` đã trỏ đúng `backend/`). Không cần khai lại biến trong `ecosystem`.

Kiểm tra:

```bash
pm2 logs tool-auto-fb-api --lines 50
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/health/ready    # phải thấy db + redis ok
```

Nếu env thiếu/sai, app **crash ngay lúc boot** kèm log liệt kê biến lỗi (rule 04) —
đó là hành vi đúng, đọc log để biết thiếu gì.

---

## 9. Build frontend

```bash
cd /var/www/tool-auto-fb/frontend
cp .env.example .env
nano .env
```

```dotenv
# FE và BE cùng domain, Nginx proxy /api → backend ⇒ để đường dẫn tương đối.
VITE_API_BASE_URL=/api
VITE_USE_MOCK=false
```

> Nếu BE ở domain khác: `VITE_API_BASE_URL=https://api.example.com/api`.
> **Tuyệt đối không đặt secret trong `frontend/.env`** — mọi biến `VITE_*` bị nhúng
> vào bundle công khai (rule 04).

```bash
npm ci
npm run build      # ra frontend/dist/
```

Biến `VITE_*` được **nhúng lúc build**. Đổi `.env` frontend ⇒ **phải build lại**,
restart Nginx không có tác dụng.

---

## 10. Nginx

`/etc/nginx/sites-available/tool-auto-fb`:

```nginx
server {
    listen 80;
    server_name tool.example.com;

    root /var/www/tool-auto-fb/frontend/dist;
    index index.html;

    # Upload media lên Drive đi qua backend. MAX_UPLOAD_MB=200 ⇒ để dư một chút.
    client_max_body_size 210M;

    access_log /var/log/nginx/tool-auto-fb.access.log;
    error_log  /var/log/nginx/tool-auto-fb.error.log;

    # SPA: mọi route không phải file tĩnh đều trả index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Asset có hash trong tên → cache dài
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Upload video lên Drive có thể lâu — nới timeout
        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
        proxy_request_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tool-auto-fb /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### HTTPS

```bash
sudo certbot --nginx -d tool.example.com
sudo systemctl status certbot.timer    # tự gia hạn
```

Sau khi có HTTPS, đảm bảo `APP_BASE_URL` / `WEB_BASE_URL` trong `backend/.env` là
`https://…` rồi `pm2 restart tool-auto-fb-api`.

---

## 11. Google Drive OAuth — cập nhật redirect URI

App dựng redirect URI từ `APP_BASE_URL`:

```
{APP_BASE_URL}/{API_PREFIX}/settings/google-drive/oauth/callback
```

Với domain thật:

```
https://tool.example.com/api/settings/google-drive/oauth/callback
```

Vào Google Cloud Console → *APIs & Services* → *Credentials* → OAuth client →
thêm **chính xác** URL trên vào *Authorized redirect URIs*. Thiếu bước này ⇒
`redirect_uri_mismatch` khi bấm "Kết nối Drive" ở màn `/settings`.

Sau khi deploy, vào UI `/settings` để nhập cấu hình Drive thật (ADR-014 — cấu hình
lưu ở bảng `app_settings`, `.env` chỉ là fallback bootstrap).

---

## 12. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Không mở 5432, 6379, 3001 ra ngoài. Kiểm tra:

```bash
sudo ss -tlnp | grep -E '5432|6379|3001'
# tất cả phải là 127.0.0.1:xxxx, không phải 0.0.0.0:xxxx
```

---

## 13. Checklist nghiệm thu

- [ ] `curl https://tool.example.com/api/health` → 200
- [ ] `curl https://tool.example.com/api/health/ready` → `db: ok`, `redis: ok`
- [ ] Mở `https://tool.example.com` → vào được màn đăng nhập
- [ ] Đăng nhập `admin@company.local` → **đổi mật khẩu ngay**
- [ ] `https://tool.example.com/api/docs` → Swagger load được
- [ ] `/settings` → kết nối Google Drive thành công (nút Test)
- [ ] Thêm 1 Facebook Page → nút "Test connection" xanh
- [ ] Upload thử 1 file video ~100MB → không dính `413 Request Entity Too Large`
- [ ] Tạo 1 slot auto-post gần giờ hiện tại → theo dõi `/queue` thấy job chạy
- [ ] `redis-cli -n 3 --scan --pattern 'tool-auto-fb*' | head` → thấy key của mình,
      và `redis-cli -n 0 dbsize` của dự án kia không đổi bất thường
- [ ] `pm2 list` → status `online`, restart count 0
- [ ] Reboot VPS thử → PM2 tự khởi động lại app

---

## 14. Quy trình cập nhật code

```bash
sudo -u deploy -H bash
cd /var/www/tool-auto-fb
git pull

cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart tool-auto-fb-api

cd ../frontend
npm ci
npm run build          # Nginx serve dist/, không cần reload nginx
```

Rollback nhanh: `git checkout <commit-cũ>` rồi lặp lại các bước build.
**Lưu ý:** migration Prisma không tự rollback — nếu commit cũ thiếu bảng mới thì
vẫn chạy được (bảng thừa không gây lỗi), nhưng đừng `migrate reset` trên production.

---

## 15. Backup

```bash
# Postgres — thêm vào crontab của root
0 2 * * * pg_dump -U toolautofb -h 127.0.0.1 tool_auto_fb | gzip > /var/backups/tool_auto_fb_$(date +\%F).sql.gz
```

Backup **bắt buộc** ngoài DB:

- `backend/.env` — đặc biệt `TOKEN_ENCRYPTION_KEY`. Mất key này thì dump DB có
  cũng vô dụng: mọi FB access token và Drive credential đã mã hoá AES-256-GCM sẽ
  không giải mã được, phải nhập tay lại toàn bộ.

Lưu key ở password manager, **không** commit, **không** để chung chỗ với dump DB.

---

## 16. Sự cố hay gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|-------------|-------------|-------|
| Boot crash: `Cấu hình env không hợp lệ` | thiếu/sai biến env | đọc danh sách biến trong log, sửa `.env` |
| `NOAUTH Authentication required` | Redis có `requirepass` nhưng code chưa hỗ trợ | làm mục 2 (patch `REDIS_PASSWORD`) |
| `TOKEN_ENCRYPTION_KEY phải là chuỗi hex 64 ký tự` | dùng `rand -base64` | `openssl rand -hex 32` |
| Prisma `P1000` | sai user/pass | thử `psql "$DATABASE_URL"` |
| Prisma `P1001` | Postgres không nghe 127.0.0.1 | `ss -tlnp \| grep 5432` |
| `permission denied for schema public` | Postgres 15+ | `GRANT ALL ON SCHEMA public TO toolautofb;` (mục 4) |
| `413 Request Entity Too Large` | thiếu `client_max_body_size` | mục 10 |
| Upload video timeout ở 60s | `proxy_read_timeout` mặc định | mục 10 |
| FE gọi API ra 404 HTML | build FE với `VITE_API_BASE_URL` sai | sửa `frontend/.env` rồi **build lại** |
| `redirect_uri_mismatch` | chưa thêm URI vào Google Console | mục 11 |
| Job kẹt `PUBLISHING` > 15 phút | worker chết giữa chừng | `pm2 logs`, xem `/queue`; `MONITOR_STUCK_MINUTES` chỉ cảnh báo, không tự sửa |
| Bài đăng trùng lên Page | chạy >1 instance backend | `pm2 list` → phải đúng 1; sửa `instances: 1` |
| Job biến mất, không lỗi | Redis evict key BullMQ | mục 1 — kiểm tra `maxmemory-policy` |

---

## 17. Phương án B — Frontend trên Vercel, Backend trên VPS

Nếu deploy FE lên Vercel (lấy domain free `*.vercel.app`) và chỉ để BE trên VPS thì
**bỏ phần serve static ở mục 10**, Nginx chỉ còn nhiệm vụ reverse proxy `/api`.

```text
https://tool-auto-fb.vercel.app        →  Vercel (FE tĩnh)
            │  fetch (CORS)
            ▼
https://api.<domain-backend>/api       →  Nginx :443 → Node :3001 (VPS)
```

### 17.1 Ràng buộc bắt buộc: backend PHẢI có HTTPS + tên miền

Trang Vercel chạy `https://`. Trình duyệt **chặn cứng** mọi request từ trang https
sang `http://` (mixed content) — không có cách bypass phía code. Nghĩa là:

- ❌ `VITE_API_BASE_URL=http://123.45.67.89:3001/api` → **không dùng được**.
- ✅ Backend phải có domain + chứng chỉ TLS.

Không có domain trả phí thì dùng một trong các cách miễn phí:

| Cách | Ghi chú |
|------|---------|
| **DuckDNS** (`abc.duckdns.org`) | free, trỏ A record về IP VPS, certbot cấp cert bình thường |
| **nip.io** (`1-2-3-4.nip.io`) | không cần đăng ký, tự resolve về IP; certbot HTTP-01 chạy được |
| **Cloudflare Tunnel** | không cần mở port, không cần IP tĩnh, TLS sẵn — nhưng phải có domain trên Cloudflare |

Ví dụ với DuckDNS:

```bash
# Trỏ subdomain về IP VPS ở duckdns.org, rồi:
sudo certbot --nginx -d toolautofb.duckdns.org
```

Nginx lúc này rút gọn (bỏ `root` / `location /`):

```nginx
server {
    listen 443 ssl;
    server_name toolautofb.duckdns.org;
    # ... ssl_certificate do certbot điền ...

    client_max_body_size 210M;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
        proxy_request_buffering off;
    }
}
```

### 17.2 Một file `.env` cho FE — được, commit thẳng vào repo

Env của frontend **không chứa secret** (rule 04 — mọi biến `VITE_*` bị nhúng vào
bundle công khai). Vì vậy không cần khai báo Environment Variables trên dashboard
Vercel: tạo **`frontend/.env.production`** và commit nó. Vite tự đọc file này khi
chạy `vite build` (mode = `production`), Vercel build là ăn ngay.

`.gitignore` hiện chỉ bỏ qua `.env`, `.env.local`, `.env.*.local` — nên
`.env.production` **được commit bình thường**, không cần sửa gì.

```dotenv
# frontend/.env.production — commit file này (không có secret)
# FE ở Vercel, BE ở VPS ⇒ phải là URL tuyệt đối, https, có sẵn /api
VITE_API_BASE_URL=https://toolautofb.duckdns.org/api
VITE_USE_MOCK=false
```

Giữ nguyên `frontend/.env` (gitignored) cho máy dev với `VITE_API_BASE_URL=/api` —
dev vẫn đi qua proxy Vite như cũ, hai môi trường không đụng nhau.

> Nhớ: biến `VITE_*` nhúng lúc **build**. Đổi URL backend ⇒ phải **redeploy** Vercel,
> không phải chỉ restart.

### 17.3 Cấu hình dự án trên Vercel

Repo có `backend/` và `frontend/` cùng cấp nên phải chỉ đúng thư mục:

| Mục | Giá trị |
|-----|---------|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

Thêm `frontend/vercel.json` để react-router (SPA) không 404 khi F5 ở route con:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 17.4 CORS — cần siết lại ở backend

[main.ts](backend/src/main.ts) hiện đang mở rộng rãi:

```ts
app.enableCors({ origin: true, credentials: true });   // phản chiếu MỌI origin
```

Chạy thì chạy được, nhưng nghĩa là bất kỳ website nào cũng gọi API của bạn được từ
trình duyệt nạn nhân. Nên khoá về đúng domain FE:

```ts
const config = app.get(AppConfigService);
app.enableCors({
  // WEB_BASE_URL = domain Vercel. Token đi qua header Authorization
  // (localStorage), không dùng cookie ⇒ không cần credentials.
  origin: [config.webBaseUrl],
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

Hai lưu ý:

- **Preview deployment của Vercel có domain ngẫu nhiên** (`tool-auto-fb-git-xxx.vercel.app`).
  Khoá cứng 1 origin ⇒ bản preview gọi API sẽ bị CORS chặn. Nếu cần dùng preview,
  cho phép thêm bằng hàm kiểm tra origin theo hậu tố `.vercel.app` — chỉ nên bật
  khi thực sự cần, vì nới ra là ai cũng deploy được 1 site `.vercel.app` để gọi API.
- Đổi CORS là **sửa code** ⇒ theo rule 00: `npm run lint && npm run build` rồi mới
  `pm2 restart`.

### 17.5 Env backend đổi gì so với mục 6

```dotenv
# Backend giờ ở domain riêng, FE ở Vercel ⇒ hai giá trị KHÁC NHAU
APP_BASE_URL=https://toolautofb.duckdns.org      # gốc backend — dựng redirect_uri OAuth Drive
WEB_BASE_URL=https://tool-auto-fb.vercel.app     # gốc frontend — CORS + redirect sau OAuth
```

Redirect URI đăng ký ở Google Cloud Console đổi theo `APP_BASE_URL`:

```
https://toolautofb.duckdns.org/api/settings/google-drive/oauth/callback
```

### 17.6 Checklist riêng cho phương án Vercel

- [ ] `curl https://toolautofb.duckdns.org/api/health` → 200 (từ máy ngoài, không phải VPS)
- [ ] Mở FE Vercel → DevTools Network: request đi tới domain backend, **không** đỏ CORS
- [ ] Đăng nhập được → token lưu localStorage → F5 vẫn giữ phiên
- [ ] F5 ở route con (vd `/contents`) → không 404 (đã có `vercel.json`)
- [ ] Upload file lớn qua FE Vercel → không 413
- [ ] Kết nối Google Drive ở `/settings` → sau OAuth quay về đúng domain Vercel

### 17.7 Đánh đổi so với phương án A (tất cả trên VPS)

| | Vercel FE + VPS BE | Tất cả trên VPS |
|-|-------------------|-----------------|
| Domain FE | free, HTTPS sẵn | phải tự lo domain + certbot |
| Domain BE | **vẫn phải có** (mixed content) | dùng chung 1 domain |
| CORS | phải cấu hình, dễ sai | không có (same-origin) |
| Deploy FE | `git push` là xong | thủ công `npm run build` |
| Số nơi phải quản | 2 | 1 |

Nếu đằng nào cũng phải dựng domain + TLS cho backend thì lợi ích "domain free" của
Vercel giảm khá nhiều — chỉ còn tiện ở khâu auto-deploy FE.

---

## 18. Việc còn phải làm trước khi deploy thật

1. **Patch Redis auth/db/prefix** (mục 2) — chưa làm thì app không kết nối được
   Redis có mật khẩu, và không cách ly được với dự án đang dùng chung.
2. Kiểm tra `maxmemory-policy` của Redis hiện có (mục 1.1) để quyết định dùng chung
   hay tách instance.
3. Sinh và cất giữ `TOKEN_ENCRYPTION_KEY` production.
4. Đăng ký redirect URI Google Drive cho domain thật.
5. Nếu đi phương án Vercel (mục 17): siết CORS theo `WEB_BASE_URL`, tạo
   `frontend/vercel.json` và `frontend/.env.production`.
