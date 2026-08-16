# Douyin Downloader — Claude Instructions

## Project overview

Tool tải video Douyin (TikTok China) không watermark, dịch transcript và lồng tiếng Việt bằng OmniVoice TTS.

## Môi trường

- Python venv: `backend/.venv/bin/python3` — **luôn dùng cái này**, không dùng `python3` hệ thống
- OmniVoice server: `http://192.168.1.61:8002`
- Project root: `/Users/thinhlevan/Downloads/douyin-downloader`

## Skills có sẵn

- `/voice-over <folder> [--voice <code>]` — Dịch transcript + TTS + ghép video thành output_vi.mp4
- `/douyin-crawler <url>` — Crawl danh sách video từ profile/trang Douyin

## Cấu trúc downloads

```
downloads/<author>/<video-title>__<id>/
  ├── index.mp4
  ├── metadata.json
  ├── transcript.json      ← transcript gốc (tiếng Trung)
  ├── transcript-vi.json   ← bản dịch tiếng Việt (nếu đã generate)
  ├── dub_vi.mp3           ← audio TTS tiếng Việt
  └── output_vi.mp4        ← video hoàn chỉnh
```

## Quy tắc

- Khi chạy script Python trong project này, luôn `cd` về project root trước
- Luôn dùng `backend/.venv/bin/python3` thay vì `python3` hay `python`
- File `transcript-vi.json` nếu đã tồn tại thì không dịch lại (bảo toàn chỉnh sửa tay)

---

## Cầu nối với tool-auto-fb (backend NestJS) — plan 28

Ba lệnh dưới đây **do máy gọi**, không phải người. Chúng nằm ở `backend/youtube.py`
+ 3 command cuối `backend/cli.py`. Không đụng tới luồng Douyin đang chạy.

```bash
# Tìm video theo keyword (Data API v3) — KHÔNG tải
YOUTUBE_API_KEY=<key> backend/.venv/bin/python3 -m backend yt-search \
    --keyword "mẹo nấu ăn" --max 20 --region VN --published-after 30 --json

# Tải 1 video về thư mục TUYỆT ĐỐI, DUY NHẤT theo job
backend/.venv/bin/python3 -m backend yt-download \
    --url <youtube-url> --out /abs/path/job-<uuid> --json

# Kiểm tra downloader có dùng được không (backend gọi lúc checkAvailability)
backend/.venv/bin/python3 -m backend contract-version --json
```

### Hợp đồng JSON — backend phụ thuộc vào đúng hình dạng này

```jsonc
// yt-search
{ "contractVersion": 1, "ok": true, "videos": [
  { "externalId": "...", "title": "...", "authorName": "...", "sourceUrl": "...",
    "publishedAt": "2026-08-01T10:00:00Z", "durationSec": 63,
    "viewCount": 152340, "thumbnailUrl": "..." } ]}

// yt-download
{ "contractVersion": 1, "ok": true, "filePath": "/abs/path/index.mp4",
  "fileSize": 12345678, "mimeType": "video/mp4" }

// lỗi (mọi lệnh) — kèm exit code != 0
{ "contractVersion": 1, "ok": false, "errorCode": "QUOTA_EXCEEDED", "message": "..." }
```

`errorCode` là **tập đóng**: `QUOTA_EXCEEDED` · `INVALID_API_KEY` ·
`VIDEO_UNAVAILABLE` · `DOWNLOAD_FAILED` · `TIMEOUT` · `UNKNOWN`.
Backend map theo **mã**, không parse chuỗi `message`.

### Bốn luật KHÔNG được phá

1. **stdout chỉ chứa ĐÚNG MỘT dòng JSON.** Mọi log người đọc (kể cả toàn bộ output
   của `yt-dlp`) đi ra **stderr**. Cấm dùng `console.print` (rich) trong 3 lệnh này —
   nó ghi vào stdout và làm `JSON.parse` phía Node nổ.
2. **API key đọc từ env `YOUTUBE_API_KEY`, KHÔNG nhận qua argv** — argv hiện trong `ps`.
3. **`--out` phải tuyệt đối và duy nhất theo job.** `downloader.py` (Douyin) bỏ qua file
   đã tồn tại >10KB; dùng thư mục chung thì job sau ăn nhầm file job trước.
4. **Đổi hình dạng field ⇒ tăng `CONTRACT_VERSION`** (`backend/youtube.py`). Backend biết
   nó hiểu version nào và sẽ dừng có thông báo khi lệch, thay vì parse ra `undefined`.

### Ghi chú vận hành

- Format tải **ưu tiên `avc1` (H.264)**, không lấy `bestvideo` chung: đo thật 2026-08-15
  thấy yt-dlp tự chọn AV1 (format 399), mà Facebook xử lý AV1 rất kém.
- `yt-dlp` cần **cập nhật định kỳ** — YouTube đổi là nó hỏng. Lỗi HTTP 403 lúc tải
  thường là throttle tạm thời phía YouTube, retry là được.
