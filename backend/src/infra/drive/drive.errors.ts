import {
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

const logger = new Logger('DriveStorage');

interface GoogleApiErrorShape {
  code?: number;
  message?: string;
  errors?: { reason?: string }[];
}

const readError = (error: unknown): GoogleApiErrorShape =>
  error !== null && typeof error === 'object' ? error : {};

/**
 * Wrap lỗi googleapis thành domain error (rule 01 §Lỗi).
 * Log nguyên response gốc, nhưng message trả ra ngoài phải nói được cách khắc phục.
 */
export function mapDriveError(error: unknown, context: string): never {
  const { code, message, errors } = readError(error);
  const reason = errors?.[0]?.reason;

  logger.error(
    `Google Drive lỗi khi ${context}: code=${String(code)} reason=${String(
      reason,
    )} message=${String(message)}`,
  );

  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
    throw new BadGatewayException(
      'Google Drive đã hết dung lượng hoặc vượt quota. Liên hệ quản trị viên.',
    );
  }

  if (code === 403) {
    throw new BadGatewayException(
      'Service account không có quyền trên folder. Hãy share folder Drive cho email service account với quyền Editor.',
    );
  }

  if (code === 404) {
    throw new BadGatewayException(
      'Không tìm thấy folder/file trên Google Drive. Kiểm tra lại Folder ID trong Cài đặt chung.',
    );
  }

  throw new InternalServerErrorException(
    `Lỗi khi ${context} trên Google Drive: ${String(message ?? 'không rõ nguyên nhân')}`,
  );
}
