import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service';
import type { MediaUploadJobsRepository } from '../media-upload-jobs.repository';
import { MediaUploadLimitGuard } from '../media-upload-limit.guard';

const makeGuard = (
  pending: number,
  maxPendingJobs = 20,
): MediaUploadLimitGuard => {
  const repository = {
    countPending: jest.fn().mockResolvedValue(pending),
  } as unknown as MediaUploadJobsRepository;
  const config = {
    mediaUpload: { maxPendingJobs },
  } as unknown as AppConfigService;

  return new MediaUploadLimitGuard(repository, config);
};

describe('MediaUploadLimitGuard', () => {
  describe('canActivate', () => {
    it('cho qua khi số job đang chạy ngầm còn dưới ngưỡng (19/20)', async () => {
      await expect(makeGuard(19).canActivate()).resolves.toBe(true);
    });

    it('chặn bằng 503 khi đã đủ đúng ngưỡng (20/20)', async () => {
      await expect(makeGuard(20).canActivate()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('chặn khi vượt ngưỡng (dữ liệu lệch do chạy nhiều tiến trình)', async () => {
      await expect(makeGuard(21).canActivate()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('message nói rõ ngưỡng hiện tại để người dùng biết chờ cái gì', async () => {
      await expect(makeGuard(5, 5).canActivate()).rejects.toThrow(
        /tối đa 5 file/,
      );
    });

    it('đọc ngưỡng từ env, không hardcode 20', async () => {
      await expect(makeGuard(3, 3).canActivate()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(makeGuard(3, 4).canActivate()).resolves.toBe(true);
    });
  });
});
