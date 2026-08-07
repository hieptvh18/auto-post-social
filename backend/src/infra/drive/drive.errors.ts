import {
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

const logger = new Logger('DriveStorage');

interface GoogleApiErrorShape {
  code?: number | string;
  message?: string;
  errors?: { reason?: string }[];
  response?: { data?: { error?: unknown; error_description?: unknown } };
}

const readError = (error: unknown): GoogleApiErrorShape =>
  error !== null && typeof error === 'object' ? error : {};

/**
 * Refresh token OAuth không còn hiệu lực (`invalid_grant`).
 *
 * Tách thành class riêng để `DriveStorageFactory` bắt được và xoá token đã lưu —
 * giữ token chết trong DB thì UI vẫn báo "đã kết nối" mà mọi upload đều lỗi.
 */
export class DriveAuthExpiredError extends BadGatewayException {
  constructor() {
    super(
      'Kết nối Google Drive đã hết hạn hoặc bị thu hồi (invalid_grant). ' +
        'Vào "Cài đặt chung" → Google Drive bấm "Kết nối Google" để cấp quyền lại. ' +
        'Nếu tuần nào cũng hỏng: OAuth consent screen đang ở chế độ Testing — ' +
        'Google thu hồi refresh token sau 7 ngày, hãy Publish app trong Google Cloud Console.',
    );
  }
}

/**
 * `invalid_grant` không đến từ Drive API mà từ bước đổi refresh token lấy access
 * token, nên không có `code`/`reason` như lỗi Drive thường — phải soi cả
 * `response.data.error` lẫn message.
 */
function isInvalidGrant(error: GoogleApiErrorShape): boolean {
  const responseError = error.response?.data?.error;
  if (responseError === 'invalid_grant') return true;
  return /invalid_grant/i.test(error.message ?? '');
}

/**
 * Mã lỗi khi thao tác trên file **nguồn** (ngoài folder của tool, plan 24).
 *
 * Tách riêng khỏi `mapDriveError` vì bước "Kiểm tra link" cần **phân loại** được
 * lỗi để hiện đúng cách khắc phục cho từng dòng, chứ không chỉ cần một câu 502.
 */
export type DriveFileErrorCode =
  | 'NOT_FOUND_OR_NO_ACCESS'
  | 'COPY_DISABLED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'UNKNOWN';

/** Lỗi thao tác trên một file Drive cụ thể, có mã để UI hiện đúng gợi ý. */
export class DriveFileError extends BadGatewayException {
  constructor(
    readonly code: DriveFileErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Phân loại lỗi googleapis cho `getMetadata()`/`copy()`.
 *
 * Khác `mapDriveError` ở chỗ: 403/404 ở đây **không** phải "sai Folder ID của
 * tool" mà là "file của người khác chưa được chia sẻ" — thông điệp phải nói
 * đúng việc user cần làm (§0.4 của plan 24).
 */
export function mapDriveFileError(error: unknown, context: string): never {
  const parsed = readError(error);
  const { code, message, errors } = parsed;
  const reason = errors?.[0]?.reason;

  logger.error(
    `Google Drive lỗi khi ${context}: code=${String(code)} reason=${String(
      reason,
    )} message=${String(message)}`,
  );

  // Token chết vẫn phải là DriveAuthExpiredError để factory xoá token đã lưu.
  if (isInvalidGrant(parsed)) throw new DriveAuthExpiredError();

  if (reason === 'cannotCopyFile') {
    throw new DriveFileError(
      'COPY_DISABLED',
      'Chủ file đã tắt quyền tải/sao chép nên không copy được. ' +
        'Hãy xin quyền Người chỉnh sửa, hoặc nhờ họ bỏ tuỳ chọn "Người xem không được tải xuống, in, sao chép".',
    );
  }

  if (
    reason === 'storageQuotaExceeded' ||
    /storage quota/i.test(message ?? '')
  ) {
    throw new DriveFileError(
      'QUOTA_EXCEEDED',
      'Google Drive của tài khoản đang kết nối đã hết dung lượng — không tạo được bản sao. ' +
        'Hãy dọn bớt file hoặc nâng dung lượng rồi thử lại.',
    );
  }

  if (
    code === 429 ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded'
  ) {
    throw new DriveFileError(
      'RATE_LIMITED',
      'Google Drive đang giới hạn tốc độ truy cập — chờ một lát rồi bấm Kiểm tra lại.',
    );
  }

  if (code === 404 || code === 403) {
    throw new DriveFileError(
      'NOT_FOUND_OR_NO_ACCESS',
      'Không đọc được file: link sai hoặc file đang ở chế độ riêng tư.',
    );
  }

  throw new DriveFileError(
    'UNKNOWN',
    `Lỗi khi ${context} trên Google Drive: ${String(
      message ?? 'không rõ nguyên nhân',
    )}`,
  );
}

/**
 * Wrap lỗi googleapis thành domain error (rule 01 §Lỗi).
 * Log nguyên response gốc, nhưng message trả ra ngoài phải nói được cách khắc phục.
 */
export function mapDriveError(error: unknown, context: string): never {
  const parsed = readError(error);
  const { code, message, errors } = parsed;
  const reason = errors?.[0]?.reason;
  // Google đôi khi trả reason=undefined nhưng nói rõ trong message.
  const quotaByMessage = /storage quota|shared drive/i.test(message ?? '');

  logger.error(
    `Google Drive lỗi khi ${context}: code=${String(code)} reason=${String(
      reason,
    )} message=${String(message)}`,
  );

  if (isInvalidGrant(parsed)) {
    throw new DriveAuthExpiredError();
  }

  if (
    reason === 'storageQuotaExceeded' ||
    reason === 'quotaExceeded' ||
    quotaByMessage
  ) {
    throw new BadGatewayException(
      'Service account không có dung lượng lưu trữ riêng nên không thể upload vào folder ' +
        'thuộc My Drive của tài khoản thường. Hãy dùng Shared Drive (Google Workspace) và ' +
        'thêm service account làm thành viên, hoặc chuyển sang xác thực OAuth theo tài khoản người dùng.',
    );
  }

  if (code === 403) {
    // 403 của Drive có nhiều nguyên nhân — tách "chưa bật API" khỏi "thiếu quyền folder".
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
      throw new BadGatewayException(
        'Google Drive API chưa được bật cho project của service account. ' +
          'Vào Google Cloud Console → APIs & Services → bật "Google Drive API" rồi thử lại.',
      );
    }

    throw new BadGatewayException(
      'Service account không có quyền trên folder. Hãy share folder Drive cho email ' +
        `service account với quyền Editor.${reason ? ` (reason: ${reason})` : ''}`,
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
