"""YouTube: tìm video theo keyword (Data API v3) + tải về (yt-dlp).

Module này viết RIÊNG cho cầu nối với backend NestJS (tool-auto-fb plan 28).
Không đụng gì tới `crawler.py`/`downloader.py` (Douyin) đang chạy.

HAI RÀNG BUỘC SỐNG CÒN — đọc trước khi sửa:

1. **stdout chỉ chứa ĐÚNG MỘT dòng JSON.** Mọi thứ cho người đọc (tiến độ, cảnh
   báo, log của yt-dlp) phải đi ra **stderr**. Lẫn một ký tự vào stdout là
   `JSON.parse` phía Node nổ (cạm bẫy C4).

2. **API key KHÔNG BAO GIỜ nằm trong argv** — nó hiện ra trong `ps`. Key đọc từ
   biến môi trường `YOUTUBE_API_KEY` do process cha truyền vào.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import aiohttp

# Phiên bản HỢP ĐỒNG JSON giữa Python và NestJS (plan 28 §3.3c).
# Đổi hình dạng field ⇒ TĂNG số này. Backend biết nó hiểu version nào; lệch thì
# nó dừng với lỗi rõ ràng thay vì parse ra `undefined` rồi hỏng ở tận tầng trên.
CONTRACT_VERSION = 1

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

# Tập mã lỗi ĐÓNG. Backend map theo MÃ, không parse chuỗi `message`
# (chuỗi sẽ đổi theo thời gian, mã thì không).
ERROR_QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
ERROR_INVALID_API_KEY = "INVALID_API_KEY"
ERROR_VIDEO_UNAVAILABLE = "VIDEO_UNAVAILABLE"
ERROR_DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
ERROR_TIMEOUT = "TIMEOUT"
ERROR_UNKNOWN = "UNKNOWN"

# Tên file cố định trong thư mục riêng của mỗi job. Thư mục do NestJS chỉ định và
# là DUY NHẤT theo job, nên tên file bên trong không cần chống trùng (cạm bẫy C5).
OUTPUT_BASENAME = "index"


class YoutubeError(Exception):
    """Lỗi có mã thuộc tập đóng ở trên."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def log(message: str) -> None:
    """Log cho NGƯỜI đọc — luôn ra stderr, không bao giờ stdout (C4)."""
    print(message, file=sys.stderr, flush=True)


def emit(payload: dict[str, Any]) -> None:
    """In ĐÚNG một dòng JSON ra stdout. Đây là thứ duy nhất backend đọc."""
    payload = {"contractVersion": CONTRACT_VERSION, **payload}
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


def emit_error(code: str, message: str) -> None:
    emit({"ok": False, "errorCode": code, "message": message})


def get_api_key() -> str:
    """Key đi qua ENV chứ không qua argv — argv hiện trong `ps` (plan 28 §3.2)."""
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        raise YoutubeError(
            ERROR_INVALID_API_KEY,
            "Thiếu biến môi trường YOUTUBE_API_KEY",
        )
    return key


# ── Tìm video ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class VideoCandidate:
    external_id: str
    title: str
    author_name: str
    source_url: str
    published_at: str | None
    duration_sec: int | None
    view_count: int | None
    thumbnail_url: str | None

    def to_json(self) -> dict[str, Any]:
        return {
            "externalId": self.external_id,
            "title": self.title,
            "authorName": self.author_name,
            "sourceUrl": self.source_url,
            "publishedAt": self.published_at,
            "durationSec": self.duration_sec,
            "viewCount": self.view_count,
            "thumbnailUrl": self.thumbnail_url,
        }


def _parse_iso8601_duration(raw: str | None) -> int | None:
    """'PT1M3S' -> 63. Trả None nếu không đọc được (live stream, format lạ)."""
    if not raw or not raw.startswith("PT"):
        return None
    total = 0
    number = ""
    for char in raw[2:]:
        if char.isdigit():
            number += char
            continue
        if not number:
            return None
        value = int(number)
        number = ""
        if char == "H":
            total += value * 3600
        elif char == "M":
            total += value * 60
        elif char == "S":
            total += value
        else:
            return None
    return total


def _raise_for_api_error(status: int, body: dict[str, Any]) -> None:
    """Đổi lỗi HTTP của Google thành mã thuộc tập đóng."""
    error = body.get("error", {}) if isinstance(body, dict) else {}
    reasons = {
        item.get("reason", "")
        for item in error.get("errors", [])
        if isinstance(item, dict)
    }
    message = error.get("message", f"YouTube API trả HTTP {status}")

    if reasons & {"quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"}:
        raise YoutubeError(ERROR_QUOTA_EXCEEDED, message)
    # 400 badRequest + keyInvalid, hoặc 403 forbidden do key sai/bị khoá.
    if reasons & {"keyInvalid", "keyExpired", "ipRefererBlocked"} or status in (
        400,
        401,
    ):
        raise YoutubeError(ERROR_INVALID_API_KEY, message)
    if status == 403:
        raise YoutubeError(ERROR_INVALID_API_KEY, message)
    raise YoutubeError(ERROR_UNKNOWN, message)


async def _get_json(
    session: aiohttp.ClientSession,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    async with session.get(f"{YOUTUBE_API_BASE}/{path}", params=params) as res:
        try:
            body = await res.json(content_type=None)
        except Exception:  # noqa: BLE001 — body không phải JSON là bất thường
            body = {}
        if res.status >= 400:
            _raise_for_api_error(res.status, body if isinstance(body, dict) else {})
        return body if isinstance(body, dict) else {}


async def search_videos(
    keyword: str,
    max_results: int = 20,
    region_code: str = "VN",
    published_after_days: int | None = 30,
    timeout_sec: int = 60,
) -> list[VideoCandidate]:
    """Tìm video theo keyword.

    Đi **2 request**: `search.list` chỉ trả id + snippet (không có thời lượng và
    lượt xem), nên phải gọi thêm `videos.list` mới đủ dữ liệu để lọc theo
    `minViewCount`/`duration`. Quota: search = 100 units, videos = 1 unit.
    """
    api_key = get_api_key()
    # Trần cứng của Data API v3 cho một trang là 50.
    page_size = max(1, min(max_results, 50))

    search_params: dict[str, Any] = {
        "key": api_key,
        "part": "snippet",
        "q": keyword,
        "type": "video",
        "maxResults": page_size,
        "order": "viewCount",
        "regionCode": region_code,
    }
    if published_after_days is not None:
        after = datetime.now(timezone.utc) - timedelta(days=published_after_days)
        search_params["publishedAfter"] = after.strftime("%Y-%m-%dT%H:%M:%SZ")

    timeout = aiohttp.ClientTimeout(total=timeout_sec)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        log(f"[youtube] search.list keyword={keyword!r} max={page_size}")
        search_body = await _get_json(session, "search", search_params)

        video_ids = [
            item["id"]["videoId"]
            for item in search_body.get("items", [])
            if isinstance(item.get("id"), dict) and item["id"].get("videoId")
        ]
        if not video_ids:
            log("[youtube] search.list không trả video nào")
            return []

        log(f"[youtube] videos.list cho {len(video_ids)} video")
        detail_body = await _get_json(
            session,
            "videos",
            {
                "key": api_key,
                "part": "snippet,contentDetails,statistics",
                "id": ",".join(video_ids),
                "maxResults": len(video_ids),
            },
        )

    candidates: list[VideoCandidate] = []
    for item in detail_body.get("items", []):
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        content_details = item.get("contentDetails", {})
        video_id = item.get("id")
        if not video_id:
            continue

        raw_views = statistics.get("viewCount")
        thumbnails = snippet.get("thumbnails", {})
        # Ưu tiên ảnh lớn nhất có sẵn — YouTube không luôn trả đủ mọi size.
        thumbnail = next(
            (
                thumbnails[size]["url"]
                for size in ("maxres", "standard", "high", "medium", "default")
                if isinstance(thumbnails.get(size), dict)
                and thumbnails[size].get("url")
            ),
            None,
        )

        candidates.append(
            VideoCandidate(
                external_id=video_id,
                title=snippet.get("title", ""),
                author_name=snippet.get("channelTitle", ""),
                source_url=f"https://www.youtube.com/watch?v={video_id}",
                published_at=snippet.get("publishedAt"),
                duration_sec=_parse_iso8601_duration(
                    content_details.get("duration")
                ),
                # `viewCount` vắng mặt khi kênh tắt hiện lượt xem ⇒ None, KHÔNG
                # phải 0: backend lọc `>= minViewCount` nên 0 sẽ loại nhầm.
                view_count=int(raw_views) if raw_views is not None else None,
                thumbnail_url=thumbnail,
            )
        )

    log(f"[youtube] trả về {len(candidates)} video")
    return candidates


# ── Tải video ──────────────────────────────────────────────────────────────


def _resolve_ytdlp_bin() -> str:
    """Đường dẫn yt-dlp. Cho phép ghi đè bằng env khi máy cài chỗ khác."""
    return os.environ.get("YT_DLP_BIN", "yt-dlp")


def download_video(
    url: str,
    out_dir: str,
    timeout_sec: int = 600,
    max_filesize_mb: int | None = 500,
) -> dict[str, Any]:
    """Tải 1 video về `out_dir` bằng yt-dlp.

    `out_dir` phải là đường dẫn TUYỆT ĐỐI và DUY NHẤT theo job (cạm bẫy C5):
    dùng thư mục chung thì job sau ăn nhầm file của job trước.
    """
    directory = Path(out_dir)
    if not directory.is_absolute():
        raise YoutubeError(
            ERROR_DOWNLOAD_FAILED, f"--out phải là đường dẫn tuyệt đối: {out_dir}"
        )
    directory.mkdir(parents=True, exist_ok=True)

    output_template = str(directory / f"{OUTPUT_BASENAME}.%(ext)s")
    command = [
        _resolve_ytdlp_bin(),
        "--no-playlist",  # link kèm ?list= không kéo về cả playlist
        "--no-progress",
        "--newline",
        # mp4 ≤1080p: vừa giới hạn Facebook, không tốn đĩa vô ích.
        #
        # **Ưu tiên `avc1` (H.264) chứ không lấy `bestvideo` chung chung.** Đo thật
        # 2026-08-15: yt-dlp tự chọn format 399 = **AV1**, mà Facebook xử lý AV1
        # rất kém (transcode lâu, có lúc từ chối). H.264 + AAC là tổ hợp Facebook
        # luôn nhận. Chuỗi fallback đi từ chặt tới lỏng để video hiếm vẫn tải được.
        "-f",
        (
            "bestvideo[height<=1080][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/"
            "best[height<=1080][vcodec^=avc1][ext=mp4]/"
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/"
            "best[height<=1080][ext=mp4]/best"
        ),
        "--merge-output-format",
        "mp4",
        "-o",
        output_template,
    ]
    if max_filesize_mb is not None:
        command += ["--max-filesize", f"{max_filesize_mb}m"]
    command.append(url)

    log(f"[youtube] yt-dlp -> {directory}")
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except FileNotFoundError as error:
        raise YoutubeError(
            ERROR_DOWNLOAD_FAILED, f"Không tìm thấy yt-dlp: {error}"
        ) from error
    except subprocess.TimeoutExpired as error:
        raise YoutubeError(
            ERROR_TIMEOUT, f"yt-dlp quá {timeout_sec}s chưa xong"
        ) from error

    # stdout của yt-dlp là log người đọc ⇒ đẩy hết sang stderr, KHÔNG để lẫn vào
    # stdout của chính process này (C4).
    if completed.stdout:
        log(completed.stdout.strip())
    if completed.stderr:
        log(completed.stderr.strip())

    if completed.returncode != 0:
        # Dọn mảnh dở trước khi ném lỗi: lần retry sau dùng lại đúng thư mục này,
        # để `.part` lại thì yt-dlp resume trên file có thể đã hỏng, và nếu job bị
        # bỏ hẳn thì đống mảnh nằm lại ăn đĩa (C5 + plan 28 §6 R5).
        for leftover in directory.glob(f"{OUTPUT_BASENAME}*"):
            if leftover.is_file():
                leftover.unlink(missing_ok=True)

        stderr = (completed.stderr or "").lower()
        if any(
            token in stderr
            for token in ("video unavailable", "private video", "has been removed")
        ):
            raise YoutubeError(
                ERROR_VIDEO_UNAVAILABLE, "Video không còn khả dụng trên YouTube"
            )
        raise YoutubeError(
            ERROR_DOWNLOAD_FAILED,
            f"yt-dlp thoát với mã {completed.returncode}",
        )

    files = sorted(
        path
        for path in directory.glob(f"{OUTPUT_BASENAME}.*")
        # Bỏ file dở của yt-dlp: .part (đang tải), .ytdl (state khôi phục).
        if path.is_file() and path.suffix not in (".part", ".ytdl")
    )
    if not files:
        # yt-dlp có thể trả mã 0 mà không tạo file — ví dụ vượt --max-filesize.
        raise YoutubeError(
            ERROR_DOWNLOAD_FAILED,
            "yt-dlp báo thành công nhưng không có file nào được tạo "
            "(có thể video vượt giới hạn dung lượng)",
        )

    video_file = files[0]
    return {
        "filePath": str(video_file),
        "fileSize": video_file.stat().st_size,
        "mimeType": "video/mp4" if video_file.suffix == ".mp4" else "video/*",
    }


def run_async(coro: Any) -> Any:
    """Chạy coroutine ở CLI đồng bộ."""
    return asyncio.run(coro)
