---
name: video-convert
description: >
  Gộp 2 bước video-download + voice-over thành 1 lệnh: tải video từ bất kỳ link nào
  (YouTube, TikTok, Facebook, Instagram, Twitter/X, Bilibili, Vimeo, và 1000+ trang khác,
  KHÔNG bao gồm douyin.com) rồi tự động dịch + lồng tiếng Việt + ghép ra output_vi.mp4 luôn,
  không cần gọi tay 2 skill riêng. Dùng khi user paste link video và muốn có ngay bản
  lồng tiếng Việt hoàn chỉnh trong 1 lệnh — ví dụ "convert giúp tôi link này",
  "tải và lồng tiếng luôn", "/video-convert <url>".
  Với link douyin.com, KHÔNG dùng skill này — dùng /douyin-crawler rồi /voice-over riêng.
metadata:
  version: 1.0.0
  license: MIT
---

# Video Convert (Download + Voice-over gộp)

Skill điều phối (orchestrator) **thuần túy gọi lại 2 skill có sẵn theo đúng thứ tự**:

```
/video-convert <url>  =  /video-download <url>  rồi  /voice-over <folder vừa tải>
```

## Nguyên tắc bắt buộc

- **KHÔNG được sửa, viết lại, hay tối ưu lại logic của `video-download` hay `voice-over`.**
  Skill này chỉ **chain 2 bước lại**, thực thi đúng nguyên văn quy trình đã định nghĩa trong:
  - `.claude/skills/video-download/SKILL.md`
  - `.claude/skills/voice-over/SKILL.md`
- Không hỏi lại user ở bất kỳ bước nào (kế thừa nguyên tắc "không hỏi" của cả 2 skill gốc).
- Link `douyin.com` → **dừng ngay, không chạy skill này**, báo user dùng `/douyin-crawler` + `/voice-over` thủ công (vì douyin-crawler có thể trả về NHIỀU video cùng lúc, không xác định rõ 1 folder duy nhất để tự động chuyển tiếp sang voice-over).

## Cú pháp

```
/video-convert <url>
/video-convert <url> --voice <voice_code>
/video-convert <url> --provider vbee|omnivoice|elevenlabs|openai
```

Các flag `--voice` / `--provider` được truyền nguyên văn xuống bước voice-over (xem Bước 3 của skill `voice-over`).

## Quy trình

### Bước 1 — Chạy đúng "Bước 0" và "Bước 1" của skill `video-download`

Thực hiện y hệt nội dung trong `.claude/skills/video-download/SKILL.md`:
1. Kiểm tra `yt-dlp` đã cài chưa (Bước 0 của video-download) — cài nếu thiếu.
2. Chạy lệnh `yt-dlp` tải video (Bước 1 của video-download) với đúng flags, đúng output template:

```bash
yt-dlp \
  -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
  --merge-output-format mp4 \
  --no-playlist \
  --write-info-json \
  --write-thumbnail \
  --restrict-filenames \
  -o "downloads/%(extractor)s/%(title).80B__%(id)s/index.%(ext)s" \
  "<URL>"
```

Nếu link là **douyin.com** → dừng lại, thông báo:
```
✗ Link douyin.com không dùng được với /video-convert.
  Hãy chạy riêng: /douyin-crawler <url>  rồi  /voice-over <folder>
```

### Bước 2 — Xác định folder vừa tải

`yt-dlp` in ra đường dẫn file trong log, hoặc suy ra từ template:
```
downloads/<extractor>/<title>__<id>/
```

Xác nhận folder tồn tại và có `index.mp4`:
```bash
ls "downloads/<extractor>/<title>__<id>/index.mp4"
```

Nếu tải nhiều link cùng lúc → lặp lại Bước 1 + Bước 2 cho từng link, rồi chạy Bước 3 tuần tự cho từng folder (không chạy song song để tránh tranh chấp GPU/CPU của Whisper hoặc rate-limit của TTS server).

### Bước 3 — Chạy nguyên văn toàn bộ quy trình của skill `voice-over` trên folder đó

Thực hiện đầy đủ **Bước 1 đến Bước 6** đã định nghĩa trong `.claude/skills/voice-over/SKILL.md` (transcribe nếu thiếu → dịch nếu thiếu → chọn provider/voice từ `.env` + CSV → TTS → sinh SRT → ghép ffmpeg), dùng `FOLDER` = folder xác định ở Bước 2.

Không tự viết lại logic — làm đúng theo tài liệu skill `voice-over` gốc, bao gồm cả nguyên tắc "KHÔNG TỰ VIẾT PYTHON CODE" ngoài các lệnh CLI đã quy định trong đó.

### Bước 4 — Báo cáo kết quả gộp

```
✅ Convert xong: <URL>

📁 downloads/<extractor>/<title>__<id>/
  ├── index.mp4            ← video gốc
  ├── index.info.json      ← metadata
  ├── transcript.json      ← transcript gốc
  ├── transcript-vi.json   ← bản dịch tiếng Việt
  ├── subtitle_vi.srt      ← subtitle tiếng Việt
  ├── dub_vi.mp3           ← audio TTS
  └── output_vi.mp4        ← video hoàn chỉnh (<size> MB)

Giọng: <voice_name>
Mở xem: open "downloads/<extractor>/<title>__<id>/output_vi.mp4"
```

## Xử lý lỗi

Kế thừa toàn bộ bảng lỗi của 2 skill gốc:
- Lỗi ở bước tải → xem "Xử lý lỗi" trong `video-download/SKILL.md`
- Lỗi ở bước dịch/TTS/ghép → xem "Xử lý lỗi" trong `voice-over/SKILL.md`

Nếu Bước 1 (tải) thất bại → dừng ngay, không chạy Bước 3 (voice-over cần `index.mp4` tồn tại).

## Ví dụ end-to-end

User gõ:
```
/video-convert https://www.youtube.com/watch?v=CEOwoZlWvgg&t=4348s
```

Skill làm:
1. Tải video bằng `yt-dlp` → `downloads/youtube/<title>__CEOwoZlWvgg/index.mp4` + `index.info.json`
2. Xác nhận folder có `index.mp4`
3. Chạy toàn bộ pipeline `voice-over` trên folder đó: transcribe → dịch → chọn voice tự động → TTS → SRT → ghép → `output_vi.mp4`
4. Báo cáo kết quả, gợi ý mở `output_vi.mp4`

Kết quả giống hệt như chạy tay:
```
/video-download https://www.youtube.com/watch?v=CEOwoZlWvgg&t=4348s
/voice-over downloads/youtube/<title>__CEOwoZlWvgg
```

## Khi nào KHÔNG dùng

| Tình huống | Dùng gì |
|---|---|
| Link `douyin.com` | `/douyin-crawler` rồi `/voice-over` riêng |
| Chỉ muốn tải, không cần lồng tiếng | `/video-download` |
| Đã có folder tải sẵn, chỉ cần lồng tiếng | `/voice-over <folder>` |
| Muốn tùy chỉnh giữa 2 bước (vd. sửa tay transcript trước khi dịch) | Chạy riêng `/video-download` rồi `/voice-over` |
