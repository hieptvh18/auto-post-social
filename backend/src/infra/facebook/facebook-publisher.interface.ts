/**
 * File media để đẩy lên Graph (multipart field `source`).
 *
 * Cố tình là **đường dẫn trên đĩa**, không phải Buffer: một video 300MB nạp vào
 * Buffer rồi qua `new Blob([...])` ngốn ~1GB RSS vì bị copy nhiều lần. Với path,
 * `fs.openAsBlob` cho undici stream thẳng từ đĩa, RAM giữ phẳng.
 */
export interface PublishFileInput {
  path: string;
  filename: string;
  mimeType: string;
  /** Byte — cần cho pha `start` của Facebook Resumable Upload API (video). */
  size: number;
}

export interface PublishMediaInput {
  /** ID page phía Meta (`facebook_pages.page_id`), không phải uuid nội bộ. */
  pageId: string;
  /** Page Access Token đã giải mã — chỉ tồn tại trong lúc gọi, không log. */
  accessToken: string;
  /** Nội dung bài đăng (caption + hashtag đã ghép sẵn). */
  message: string;
  file: PublishFileInput;
}

/**
 * Bài album: nhiều ảnh, **một** message. Facebook không cho ghép nhiều video hay
 * trộn ảnh + video vào một bài feed nên đây luôn là ảnh (chặn ở service).
 */
export interface PublishAlbumInput {
  pageId: string;
  accessToken: string;
  message: string;
  /**
   * Mượn file theo yêu cầu, **tuần tự từng ảnh**: album 10 ảnh không được giữ 10
   * file trên tay cùng lúc. Trả về đúng ảnh thứ `index` theo thứ tự đăng.
   */
  files: {
    count: number;
    withFile: <T>(
      index: number,
      fn: (file: PublishFileInput) => Promise<T>,
    ) => Promise<T>;
  };
}

export interface PublishResult {
  /**
   * ID dùng để mở bài trên Facebook. Với ảnh là `post_id` (id bài viết), không
   * phải `id` của photo object; với video là `id` của video.
   */
  postId: string;
}

/** Cổng ra Meta Graph để đăng bài (rule 01: external API nằm sau interface trong infra/). */
export interface FacebookPublisher {
  publishImage(input: PublishMediaInput): Promise<PublishResult>;
  publishVideo(input: PublishMediaInput): Promise<PublishResult>;
  /** Nhiều ảnh trong MỘT bài viết (plan 21). */
  publishImageAlbum(input: PublishAlbumInput): Promise<PublishResult>;
}
