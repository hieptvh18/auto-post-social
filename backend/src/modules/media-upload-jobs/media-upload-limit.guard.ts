import {
  Injectable,
  ServiceUnavailableException,
  type CanActivate,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MediaUploadJobsRepository } from './media-upload-jobs.repository';

/**
 * Chặn nhận file mới khi đã đủ `MEDIA_UPLOAD_MAX_PENDING_JOBS` job chạy ngầm.
 *
 * **Vì sao là Guard chứ không phải một dòng `if` trong controller:** vòng đời
 * request của Nest là Middleware → **Guard** → Interceptor → Pipe → Handler.
 * Kiểm ở controller nghĩa là multer (Interceptor) **đã** nhận trọn file và ghi
 * xong xuống đĩa rồi mới bị từ chối — tốn băng thông và đĩa cho một request
 * chắc chắn hỏng. Ở tầng Guard thì chưa byte nào được ghi.
 *
 * Đếm trên **toàn hệ thống**, không theo từng user: tài nguyên bị bảo vệ (đĩa,
 * RAM) là của cả server, giới hạn per-user không chặn được gì.
 */
@Injectable()
export class MediaUploadLimitGuard implements CanActivate {
  constructor(
    private readonly repository: MediaUploadJobsRepository,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(): Promise<boolean> {
    const max = this.config.mediaUpload.maxPendingJobs;
    const pending = await this.repository.countPending();

    if (pending >= max) {
      // Quá tải tạm thời, không phải lỗi input của request này ⇒ 503.
      throw new ServiceUnavailableException(
        `Hệ thống đang xử lý tối đa ${max} file upload cho phép, vui lòng thử lại sau`,
      );
    }
    return true;
  }
}
