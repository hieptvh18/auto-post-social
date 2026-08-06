/**
 * Trần số ảnh gom vào **một** bài (`content_assets` + `content_asset_files`).
 * 10 là giới hạn `attached_media[i]` của Graph API khi đăng bài nhiều ảnh — vượt
 * là Facebook từ chối cả bài, nên chặn ngay từ lúc tạo record.
 *
 * (Trước plan 22 hằng số này tên `MAX_ASSETS_PER_POST` và nằm ở
 * `auto-post-configs.service.ts` — số ảnh/bài khi đó là cấu hình của mốc giờ.)
 */
export const MAX_IMAGES_PER_CONTENT_ASSET = 10;
