import { BadRequestException } from '@nestjs/common';
import { MediaType } from '../../../generated/prisma/client';

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/quicktime'] as const;

/**
 * Whitelist mime — suy ra `mediaType`, mime lạ ⇒ 400. Dùng chung cho cả upload
 * đồng bộ (`POST /media/upload`) lẫn upload qua hàng đợi (plan 23), để hai
 * đường không lệch nhau về danh sách định dạng cho phép.
 */
export function resolveMediaType(mimeType: string): MediaType {
  if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.image;
  }
  if ((ALLOWED_VIDEO_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.video;
  }

  throw new BadRequestException(
    `Định dạng "${mimeType}" không được hỗ trợ. Chỉ nhận: ${[
      ...ALLOWED_IMAGE_MIMES,
      ...ALLOWED_VIDEO_MIMES,
    ].join(', ')}`,
  );
}
