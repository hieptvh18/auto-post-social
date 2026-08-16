# Plan 28 — Cầu nối NestJS ⇄ Python downloader (YouTube)

**Milestone:** M12 · **Trạng thái:** ✅ xong 2026-08-15 (chưa test với API key thật)
**Phụ thuộc:** [27-reup-schema-topics.md](./27-reup-schema-topics.md) **phải nghiệm thu xong**
**Spec tham chiếu:** không có — plan này là spec tạm
**Bản đồ:** [README.md](./README.md) (QĐ-1, QĐ-2, cạm bẫy C4/C5)

---

## 1. Mục tiêu

Hôm nay `ai-video-downloader` là CLI chạy tay, in bảng `rich` cho người đọc, và **chỉ
làm Douyin** — không có YouTube, không có đầu ra máy đọc được.

Sau plan này: backend NestJS gọi được Python bằng một method có type
(`downloader.download(url, outDir)`), nhận JSON kết quả, và tải được video YouTube thật
về đĩa server. Chưa có cron, chưa lên Drive — chỉ chứng minh **cầu nối chạy thông**.

Tách riêng plan này vì đây là vùng rủi ro kỹ thuật cao nhất cả bộ: hai runtime khác
nhau, process con, parse stdout, timeout, đường dẫn tuyệt đối. Gộp vào plan cron thì
khi hỏng không biết hỏng ở tầng nào.

## 2. Ngoài phạm vi

- **Không** cron, **không** queue, **không** Drive, **không** `content_assets`. Plan 29.
- **Không** implement Douyin/TikTok (QĐ-2) — adapter khai báo nhưng ném `NotImplementedError`.
- **Không** transcribe / dịch / lồng tiếng. `transcribe.py`, `voices/` ngoài phạm vi.
- **Không** viết HTTP service Python (QĐ-1).
- **Không** sửa `crawler.py` (Douyin). Plan này chỉ **thêm** file mới bên Python.

## 3. Thiết kế

### 3.1 Phía Python — thêm mới, không sửa cái đang chạy

```text
ai-video-downloader/backend/
├── youtube.py        ← MỚI: search qua Data API v3 + tải qua yt-dlp
└── cli.py            ← thêm 2 lệnh, không đụng lệnh cũ
```

Hai lệnh mới, **đầu ra JSON thuần trên stdout**:

```bash
# 1) Tìm video theo keyword — KHÔNG tải
python -m backend yt-search --keyword "mẹo nấu ăn" --max 20 \
       --region VN --published-after 30 --api-key <key> --json

# 2) Tải 1 video về thư mục chỉ định
python -m backend yt-download --url <youtube-url> --out /abs/path/job-<uuid> --json
```

**Hợp đồng đầu ra — backend phụ thuộc vào đúng hình dạng này:**

```jsonc
// yt-search --json
{ "ok": true, "videos": [
  { "externalId": "abc123", "title": "...", "authorName": "...",
    "sourceUrl": "https://www.youtube.com/watch?v=abc123",
    "publishedAt": "2026-08-01T10:00:00Z", "durationSec": 63,
    "viewCount": 152340, "thumbnailUrl": "https://..." }
]}

// yt-download --json
{ "ok": true, "filePath": "/abs/path/job-<uuid>/index.mp4",
  "fileSize": 12345678, "mimeType": "video/mp4", "durationSec": 63 }

// lỗi (cả 2 lệnh) — exit code != 0
{ "ok": false, "errorCode": "QUOTA_EXCEEDED", "message": "..." }
```

`errorCode` là tập đóng: `QUOTA_EXCEEDED` · `INVALID_API_KEY` · `VIDEO_UNAVAILABLE` ·
`DOWNLOAD_FAILED` · `TIMEOUT` · `UNKNOWN`. Backend map sang domain error theo mã này,
**không** parse chuỗi `message` (chuỗi sẽ đổi, mã thì không).

**Cạm bẫy C4 — bắt buộc:** mọi log cho người đọc (`rich`, progress bar) phải in ra
**stderr**. stdout chỉ chứa **đúng một dòng JSON**. Lẫn một ký tự là `JSON.parse` nổ.

**Cạm bẫy C5 — bắt buộc:** `--out` nhận đường dẫn **tuyệt đối, duy nhất theo job**
(`<tmpdir>/reup/<reupVideoId>/`). `downloader.py` hiện bỏ qua file đã tồn tại >10KB;
dùng thư mục chung ⇒ job sau ăn nhầm file job trước.

Phụ thuộc mới: `yt-dlp` (đã có ở `/opt/homebrew/bin/yt-dlp`) + `google-api-python-client`
hoặc gọi thẳng REST bằng `aiohttp` (đã có). **Ưu tiên REST + `aiohttp`** — không thêm
dependency nặng chỉ để gọi 1 endpoint.

> Tải bằng `yt-dlp` gọi qua subprocess với `--no-playlist --max-filesize`, format ưu tiên
> `mp4` ≤1080p để file vừa giới hạn Facebook và không tốn đĩa vô ích.

### 3.2 Phía NestJS — port + adapter

```text
src/infra/reup-downloader/
├── reup-downloader.interface.ts   # ReupDownloaderPort + type kết quả
├── python-reup.adapter.ts         # spawn process con, parse JSON
├── reup-downloader.errors.ts      # domain error theo errorCode
└── reup-downloader.module.ts
```

```ts
export interface ReupDownloaderPort {
  search(params: SearchParams): Promise<ReupVideoCandidate[]>;
  download(params: { url: string; outDir: string }): Promise<DownloadedFile>;
}
```

Adapter dùng `child_process.spawn` (**không** `exec` — `exec` đệm stdout trong RAM, file
JSON lớn hoặc log rác sẽ tràn buffer):

- Thu stdout vào chuỗi, stderr đẩy vào Pino ở mức `debug`.
- **Timeout cứng**: search 60 giây, download 10 phút (config được). Quá hạn ⇒ `kill()`
  process **và cả cây con** (`yt-dlp` là process cháu — `detached: true` + `kill(-pid)`,
  nếu không sẽ để lại process mồ côi chiếm CPU/đĩa).
- Exit code != 0 hoặc `ok: false` ⇒ ném domain error tương ứng, **không** ném lỗi Node thô.
- **Không log API key** (rule 01 §Bảo mật). Key truyền qua **biến môi trường** của process
  con, **không** qua argv — argv hiện trong `ps`.

### 3.3 API key YouTube để ở đâu

Theo ADR-014 (credential sửa từ UI, không restart) — giống `facebook_app`, `drive`:

```ts
SettingKey.YOUTUBE_API = 'youtube_api'
interface YoutubeApiSettingsValue {
  apiKeyEnc: string | null;   // AES-256-GCM, chỉ decrypt lúc gọi
  dailyQuota: number;         // mặc định 10000
}
```

API trả setting phải **mask key** (4 ký tự cuối) như đang làm với page token.
Chưa cấu hình ⇒ port ném `YoutubeNotConfiguredError` (plan 29 dịch thành
`SKIPPED/NOT_CONFIGURED`, không spam log).

Biến `.env` mới — **chỉ đường dẫn**, không phải secret. **Tất cả đều optional** (QĐ-6):

```bash
REUP_PYTHON_BIN=/path/to/ai-video-downloader/backend/.venv/bin/python3
REUP_PROJECT_DIR=/path/to/ai-video-downloader
REUP_TMP_DIR=./.tmp-reup          # thư mục file tạm, mặc định trong backend/
REUP_DOWNLOAD_TIMEOUT_MS=600000
```

⇒ Cập nhật `.env.example` **cùng commit** (rule 04).

### 3.3b Downloader vắng mặt ⇒ degrade, **không** crash (QĐ-6)

**Đây là điểm khác với mọi module khác trong dự án.** Rule 04 nói env thiếu ⇒ app crash
lúc boot. Với reup thì **ngược lại**: thiếu `REUP_PYTHON_BIN` là chuyện bình thường
(máy chưa cài downloader), và backend phải chạy đủ mọi tính năng còn lại.

```text
Khởi động app:
   KHÔNG kiểm tra REUP_PYTHON_BIN có tồn tại không
   KHÔNG spawn thử
   ⇒ app boot bình thường dù không có downloader

Lúc adapter thực sự được gọi (cron/queue/endpoint debug):
   1. thiếu REUP_PYTHON_BIN hoặc REUP_PROJECT_DIR   ⇒ DownloaderUnavailableError
   2. file REUP_PYTHON_BIN không tồn tại/không +x    ⇒ DownloaderUnavailableError
   3. spawn ném ENOENT                               ⇒ DownloaderUnavailableError
   ⇒ log 1 dòng WARN (không stack trace), plan 29 dịch thành
      reup_runs SKIPPED / DOWNLOADER_UNAVAILABLE
```

`DownloaderUnavailableError` phải **tách riêng** khỏi các lỗi vận hành khác
(`QUOTA_EXCEEDED`, `DOWNLOAD_FAILED`). Gộp chung thì không phân biệt được "chưa cài
downloader" với "downloader chạy nhưng video hỏng" — hai thứ cần hành động khác hẳn nhau.

Thêm một method để UI hỏi trạng thái mà **không** phải chạy thật:

```ts
interface ReupDownloaderPort {
  search(...): Promise<ReupVideoCandidate[]>;
  download(...): Promise<DownloadedFile>;
  /** Kiểm tra downloader có dùng được không. KHÔNG ném lỗi — luôn trả kết quả. */
  checkAvailability(): Promise<{ available: boolean; reason?: string; version?: string }>;
}
```

`checkAvailability()` chạy `python -m backend --version --json` với timeout ngắn (5s).
Dùng cho banner ở `/reup` và endpoint `GET /reup/health`.

### 3.3c Version hợp đồng — chống parse sai âm thầm

Hai project tiến hoá độc lập ⇒ phải có cách phát hiện lệch hợp đồng. Mọi response JSON
kèm `contractVersion`:

```jsonc
{ "contractVersion": 1, "ok": true, "videos": [...] }
```

Backend biết version nó hiểu (`REUP_CONTRACT_VERSION = 1`). Lệch ⇒
`DownloaderContractMismatchError`, `SKIPPED/CONTRACT_MISMATCH`. **Không** cố parse tiếp.

Không có cờ này thì Python đổi tên field một hôm nào đó, backend parse ra `undefined`,
và lỗi hiện ra ở tận bước tạo `content_assets` — cách chỗ hỏng thật vài tầng.

### 3.4 Endpoint kiểm thử tay

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| `POST` | `/reup/debug/search` | `reup:manage` | body `{ keyword, max }` ⇒ trả danh sách, **không** lưu DB |
| `POST` | `/reup/debug/download` | `reup:manage` | body `{ url }` ⇒ tải về `REUP_TMP_DIR`, trả đường dẫn + size |
| `GET` | `/reup/health` | `reup:view` | `checkAvailability()` — downloader có dùng được không, version bao nhiêu. **Không** ném lỗi khi vắng mặt |

Hai endpoint debug tồn tại để nghiệm thu cầu nối **trước khi** dựng cron — không có chúng
thì plan 29 phải debug 2 tầng cùng lúc. Giữ lại sau plan 29 (hữu ích khi Python hỏng),
nhưng đặt dưới `reup:manage` và ghi rõ trong Swagger là công cụ chẩn đoán.

### 3.6 Đường nâng cấp lên HTTP — ghi sẵn, KHÔNG code bây giờ

Chốt 2026-08-15: giai đoạn này dùng spawn (QĐ-1, QĐ-6). Ghi lại đây để sau này đổi là
**sửa 1 file adapter**, không phải thiết kế lại.

Thứ **giữ nguyên** khi đổi sang HTTP:
- Interface `ReupDownloaderPort` — cả 3 method, không đổi chữ nào.
- Hợp đồng JSON §3.1 + `contractVersion` — payload y hệt, chỉ khác đường truyền.
- Tập `errorCode` đóng — map sang HTTP status thay vì exit code.

Thứ **phải giải quyết** khi đổi (lý do chưa làm bây giờ):
- **File `.mp4` đi đâu.** Spawn thì hai bên chung đĩa. HTTP thì hoặc Python upload ngược
  về backend (tốn băng thông, phải làm streaming), hoặc Python tự đẩy Drive (bỏ QĐ-3,
  Python phải cầm service-account JSON — thêm một chỗ giữ secret).
- Deploy thêm một service: healthcheck, restart policy, log tập trung.

**Khi nào nên đổi:** cần chạy downloader trên máy khác (GPU, IP khác vùng), hoặc số
lượng vượt xa 2-3 video/ngày tới mức cần scale riêng. Chưa chạm ngưỡng đó thì đổi là
tự thêm việc.

## 4. Task

**Python (`ai-video-downloader/`)**
- [x] `backend/youtube.py`: `search_videos()` (Data API v3 REST qua aiohttp) + `download_video()` (yt-dlp subprocess)
- [x] `backend/cli.py`: thêm lệnh `yt-search`, `yt-download` với `--json`
- [x] **Mọi log người đọc chuyển sang stderr** khi có `--json` (C4)
- [x] `errorCode` tập đóng + exit code != 0 khi lỗi
- [x] `requirements.txt`: thêm `yt-dlp`
- [x] Cập nhật `ai-video-downloader/CLAUDE.md`: 2 lệnh mới + hợp đồng JSON

**Backend**
- [x] `SettingKey.YOUTUBE_API` + mask key khi trả API (mượn khuôn `facebook_app`)
- [x] `src/infra/reup-downloader/` — interface + adapter spawn + errors + module
- [x] Timeout + kill cây process con (`detached` + `kill(-pid)`) (§3.2)
- [x] Truyền API key qua **env của process con**, không qua argv
- [x] Config namespace `reup` (`src/config/reup.config.ts`) — biến reup **optional**,
      **KHÔNG** validate/crash lúc khởi động (§3.3b, QĐ-6)
- [x] `DownloaderUnavailableError` **tách riêng** khỏi lỗi vận hành khác (§3.3b)
- [x] `checkAvailability()` — không ném lỗi, timeout 5s
- [x] `contractVersion` trong mọi response + `DownloaderContractMismatchError` (§3.3c)
- [x] `.env.example`: 4 biến mới, ghi chú rõ **optional — thiếu thì tính năng reup tắt**
- [x] 2 endpoint debug + `GET /reup/health` §3.4

**Test bắt buộc** (adapter = vùng dễ sai: process con, parse)
- [x] Mock `spawn`: stdout JSON hợp lệ ⇒ trả object đúng type
- [x] stdout lẫn rác trước JSON ⇒ **không** crash, ném `ParseError` rõ nghĩa (C4)
- [x] exit code != 0 + `errorCode: QUOTA_EXCEEDED` ⇒ ném đúng domain error
- [x] `INVALID_API_KEY` ⇒ domain error riêng (plan 29 cần phân biệt để `SKIPPED`)
- [x] Quá timeout ⇒ process bị kill + ném `TimeoutError`
- [x] Chưa cấu hình key ⇒ `YoutubeNotConfiguredError`, **không** spawn process (assert mock)
- [x] Log **không** chứa API key (assert trên logger giả)

**Test bắt buộc — độc lập với downloader (QĐ-6)**
- [x] Thiếu `REUP_PYTHON_BIN` ⇒ `DownloaderUnavailableError`, **không** spawn
- [x] `REUP_PYTHON_BIN` trỏ file không tồn tại ⇒ `DownloaderUnavailableError`
- [x] spawn ném `ENOENT` ⇒ `DownloaderUnavailableError`, **không** phải lỗi 500 chung
- [x] `DownloaderUnavailableError` **khác kiểu** với `DownloadFailedError`/`QuotaExceededError`
- [x] `checkAvailability()` khi vắng downloader ⇒ trả `{available:false, reason}`, **không ném**
- [x] `contractVersion` lệch ⇒ `DownloaderContractMismatchError`, không parse tiếp (§3.3c)
- [x] **App khởi động được** khi mọi biến `REUP_*` đều trống (test module init)

**Chốt**
- [x] `npm run lint && npm run build` xanh · `npm run test` xanh
- [x] `.env.example` đã cập nhật
- [x] `contexts.md` §4 §5 + ghi cạm bẫy vào §7

## 5. Điều kiện nghiệm thu

### Đã kiểm chứng THẬT (chạy lệnh, không phải chỉ unit test)

- [x] `yt-download` với URL YouTube thật ⇒ file `.mp4` **tồn tại thật trên đĩa**,
      `fileSize` khớp `stat` (đo: 288.738.743 byte), mở xem được
- [x] **stdout đúng MỘT dòng JSON** (`wc -l` = 1) trong khi stderr có 8+ dòng log
      yt-dlp ⇒ cạm bẫy C4 đã chặn được, kiểm bằng redirect tách 2 luồng
- [x] Video đã bị gỡ ⇒ `VIDEO_UNAVAILABLE` (gặp thật với 1 URL chết), không phải
      lỗi chung chung
- [x] YouTube trả HTTP 403 throttle ⇒ `DOWNLOAD_FAILED` (retry được), phân biệt
      đúng với `VIDEO_UNAVAILABLE` (retry vô nghĩa)
- [x] `--out` tương đối ⇒ báo lỗi rõ, không tạo file lung tung (C5)
- [x] Chưa có `YOUTUBE_API_KEY` ⇒ `INVALID_API_KEY`, exit 1, **không** stack trace rác
- [x] **App khởi động bình thường** khi `.env` **không có** biến `REUP_*` nào:
      Nest init đủ 100% module, `ReupDownloaderModule` nạp xong, **0 dòng log nào
      nhắc tới việc kiểm downloader** ⇒ QĐ-6 §1 đúng
- [x] 10 route `/api/reup/*` đăng ký đủ (5 topics + health + 2 settings + 2 debug)
- [x] Format tải là **H.264 (299)**, không phải AV1 (399) — xem ISSUES I11

### CHƯA kiểm chứng — cần API key YouTube thật

- [ ] ⚠️ `POST /reup/debug/search` trả ≥5 video thật: **chưa có API key** để chạy.
      Đường code đã phủ bằng unit test (mock spawn, 25 case) nhưng **chưa gọi
      Google thật lần nào**
- [ ] ⚠️ Nhập API key **sai** ⇒ `INVALID_API_KEY`: mới test ở tầng "thiếu key",
      chưa test key sai định dạng do Google trả về
- [ ] ⚠️ `REUP_DOWNLOAD_TIMEOUT_MS=5000` + video dài ⇒ `ps aux | grep yt-dlp`
      **không còn process mồ côi**: logic giết cả cây process đã có unit test
      (assert `process.kill(-pid)`), nhưng **chưa đo bằng `ps` thật**
- [ ] ⚠️ `grep` log tìm API key ⇒ không có kết quả: đã có unit test khẳng định key
      **không nằm trong argv** và đi qua env, nhưng chưa grep file log thật
- [ ] ⚠️ Trả lại thư mục downloader ⇒ `/reup/health` báo `available: true` **không
      cần restart**: code đọc config mỗi lần gọi (không cache) nên đúng theo thiết
      kế, nhưng chưa bấm thật

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | stdout lẫn log `rich` ⇒ parse JSON nổ (C4) | JSON ra stdout, log ra stderr; test có case stdout bẩn |
| R2 | Process `yt-dlp` mồ côi khi timeout ⇒ ăn CPU/đĩa dần | `detached: true` + `kill(-pid)` giết cả nhóm; nghiệm thu có bước `ps aux` |
| R3 | Đường dẫn Python/venv khác nhau giữa máy dev và server | Đưa vào `.env` (`REUP_PYTHON_BIN`). **KHÔNG** crash lúc boot (QĐ-6) — phát hiện lúc gọi, degrade thành `DOWNLOADER_UNAVAILABLE` hiện trên UI |
| R8 | Backend biết đường dẫn nội bộ của project Python ⇒ đổi cấu trúc bên kia là hỏng bên này | Chấp nhận có ý thức (QĐ-1). Giảm thiểu: chỉ phụ thuộc **2 đường dẫn** + hợp đồng JSON, không import code. `contractVersion` bắt lệch sớm (§3.3c) |
| R9 | "Độc lập" chỉ nằm trên giấy, không ai kiểm | Mục nghiệm thu có bước **xoá hẳn thư mục downloader** rồi chạy lại toàn bộ tính năng khác |
| R4 | YouTube đổi/siết, `yt-dlp` hỏng | Adapter sau interface `ReupDownloaderPort` ⇒ đổi 1 file. `yt-dlp` cần cập nhật định kỳ — ghi vào `contexts.md` §7 |
| R5 | File tạm không được dọn ⇒ đầy đĩa | Plan 29 xoá sau khi lên Drive; plan này chấp nhận rác trong `REUP_TMP_DIR`, ghi nợ rõ |
| R6 | API key lọt vào `ps`/log | Truyền qua env process con, không qua argv; test assert log sạch |
| R7 | Quota YouTube: `search.list` = **100 units/lần**, trần 10.000/ngày | Plan 29 mới cộng dồn quota. Plan này chỉ gọi tay ⇒ nhắc người test đừng bấm liên tục |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-15
- **File chính:**
  - Python: `ai-video-downloader/backend/youtube.py` (mới), `backend/cli.py` (+3 lệnh
    `yt-search`/`yt-download`/`contract-version`), `backend/requirements.txt`, `CLAUDE.md`
  - BE infra: `src/infra/reup-downloader/` — `reup-downloader.interface.ts` (port +
    `REUP_CONTRACT_VERSION`), `python-reup.adapter.ts` (spawn), `reup-downloader.errors.ts`
    (9 class lỗi), `reup-downloader.module.ts`, `__tests__/python-reup.adapter.spec.ts`
  - BE module: `modules/reup/reup-downloader.controller.ts`, `reup-debug.service.ts`,
    `dto/debug-{search,download}.dto.ts`, `reup.module.ts`
  - Settings: `settings.types.ts` (+`YOUTUBE_API`), `settings.service.ts` (+4 method),
    `dto/update-youtube-api-settings.dto.ts`
  - Config: `env.validation.ts` (4 biến **optional**), `app-config.service.ts` (`get reup`),
    `.env.example`
- **Khác thiết kế ban đầu:**
  1. API key YouTube ở `/reup/settings/youtube` thay vì `/settings` — tránh lộ tính năng
     cho ADMIN (I10).
  2. Format tải ép **H.264**, không để yt-dlp tự chọn AV1 (I11).
  3. `checkAvailability()` dùng lệnh `contract-version` riêng thay vì `--version` — nhờ đó
     kiểm luôn hợp đồng ngay ở banner (I12).
  4. `parseJsonLine` quét ngược từ dòng cuối, chịu được stdout bẩn (I13).
  5. Python **tự timeout sớm hơn Node 10%** để kịp in JSON lỗi tử tế thay vì bị giết ngang.
  6. Dọn `.part`/mảnh dở khi tải hỏng — không có thì retry lần sau resume trên file hỏng,
     và job bị bỏ sẽ để rác lại vĩnh viễn (§6 R5).
  7. `viewCount`/`durationSec` vắng mặt ⇒ **`null`, không phải 0** — kênh tắt hiện lượt
     xem mà quy về 0 thì bộ lọc `minViewCount` của plan 29 loại nhầm (bài học `null ≠ 0`
     của plan 25).
- **Test:** BE **1000 xanh (+28)** — 25 case adapter (mock `spawn`: parse, rác stdout,
  6 mã lỗi, contract mismatch, timeout + `kill(-pid)`, 6 case độc-lập-với-downloader)
  + 3 case env `REUP_*` optional. Lint + build xanh.
- **Đo thật bằng tay:** tải 1 video YouTube 288MB thành công qua đúng đường
  `python -m backend yt-download`; xác nhận stdout **1 dòng JSON** / stderr 8 dòng log;
  app boot đủ module khi không cấu hình `REUP_*` nào.
- **Còn nợ:**
  1. **Chưa có API key YouTube thật** ⇒ `yt-search` chưa gọi Google lần nào (chỉ mock).
     Đây là chặn lớn nhất trước khi làm plan 29 — cron discovery hoàn toàn dựa vào nó.
  2. Chưa đo process mồ côi bằng `ps` thật (có unit test cho `kill(-pid)`).
  3. Chưa có UI cấu hình API key ở màn Reup (backend đã đủ endpoint).
  4. `yt-dlp` cần cập nhật định kỳ — YouTube đổi là hỏng. Ghi vào `contexts.md` §7.
