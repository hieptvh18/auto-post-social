# 09 — Deployment

> Docker Compose, Nginx, production — v3.0

---

## 1. Target Infrastructure

| Resource | Spec |
|----------|------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 50 GB SSD |
| OS | Linux (Ubuntu 22.04+) |

Phù hợp ~50–200 posts/day, 1 API + 1 Worker instance.

---

## 2. Services (Docker Compose)

```text
┌─────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────┐
│  Nginx  │─▶│   API   │  │  Worker  │  │ Postgres│  │ Redis │
│  :80/443│  │  :3000  │  │ (BullMQ) │  │  :5432  │  │ :6379 │
└─────────┘  └─────────┘  └──────────┘  └────────┘  └───────┘
                  │
            ┌─────────┐
            │ Frontend │  (static build served by Nginx)
            └─────────┘
```

---

## 3. docker-compose.yml (outline)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: social_workflow
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app']

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  api:
    build: ./backend
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    ports:
      - '3000:3000'

  worker:
    build: ./worker
    env_file: .env
    depends_on:
      - api
      - redis
      - postgres

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - api

volumes:
  pgdata:
  redisdata:
```

---

## 4. Nginx Config

```nginx
server {
  listen 80;
  server_name admin.company.local;

  # Frontend SPA
  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }

  # API proxy
  location /api/ {
    proxy_pass http://api:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;  # video upload
    client_max_body_size 500M;
  }
}
```

HTTPS: Let's Encrypt certbot hoặc internal CA.

---

## 5. Environment (.env.production)

```env
NODE_ENV=production
PORT=3000
API_PREFIX=api
DATABASE_URL=postgresql://app:${DB_PASSWORD}@postgres:5432/social_workflow

REDIS_HOST=redis
REDIS_PORT=6379

JWT_ACCESS_SECRET=<random-64>
JWT_REFRESH_SECRET=<random-64>
TOKEN_ENCRYPTION_KEY=<32-bytes-hex>

GOOGLE_SERVICE_ACCOUNT_JSON=/run/secrets/google_sa.json
GOOGLE_DRIVE_FOLDER_ID=

META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
```

Secrets: Docker secrets hoặc mounted volume — không trong image.

---

## 6. Deploy Steps

```bash
# 1. Clone + config
git clone ...
cp .env.example .env
# edit .env

# 2. Build frontend
cd frontend && npm ci && npm run build

# 3. Start stack
docker compose -f docker/docker-compose.yml up -d --build

# 4. Migrate DB
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed

# 5. Health check
curl http://localhost/api/health/ready
```

---

## 7. Process Management

| Process | Command |
|---------|---------|
| API | `node dist/main.js` |
| Worker | `node dist/worker/main.js` |
| Migrations | `prisma migrate deploy` (on deploy) |

Production: Docker restart policy `unless-stopped`.

---

## 8. Backup

| Data | Strategy |
|------|----------|
| PostgreSQL | Daily `pg_dump` → offsite |
| Redis | AOF persistence — rebuild queue OK từ DB reconciliation |
| Google Drive | Managed by Google — SA có access |
| Media files | Không trên server |

---

## 9. Monitoring (V1)

- Health endpoints: `/api/health`, `/api/health/ready`
- Pino JSON logs → stdout → Docker logs / Loki V2
- Alert: FAILED publish spike, disk > 80%

---

## 10. Security Checklist

- [ ] HTTPS only production
- [ ] Firewall: chỉ 80/443 public
- [ ] Postgres/Redis internal network only
- [ ] Strong JWT secrets rotated
- [ ] SA JSON read-only mount
- [ ] `client_max_body_size` aligned với upload limit
- [ ] Rate limit login endpoint

---

## 11. Local Development

```bash
# Infra only
docker compose -f docker/docker-compose.dev.yml up postgres redis

# API
cd backend && npm run start:dev

# Worker
cd worker && npm run start:dev

# Frontend
cd frontend && npm run dev
```
