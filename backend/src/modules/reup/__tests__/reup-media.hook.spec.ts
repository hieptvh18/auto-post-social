import { ReupVideoStatus } from '../../../../generated/prisma/client';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { MediaUploadJobRecord } from '../../media-upload-jobs/media-upload-jobs.repository';
import { ReupMediaUploadHook } from '../reup-media.hook';
import type { ReupVideosRepository } from '../reup-videos.repository';

const makeJob = (
  overrides: Partial<MediaUploadJobRecord> = {},
): MediaUploadJobRecord =>
  ({
    id: 'job-1',
    reupVideoId: 'video-1',
    metadata: { autoApprove: false },
    ...overrides,
  }) as MediaUploadJobRecord;

const makeVideo = () => ({
  id: 'video-1',
  title: 'Video reup',
  sourceUrl: 'https://youtu.be/abc',
  authorName: 'Kênh A',
  fileSize: BigInt(1234),
  status: ReupVideoStatus.UPLOADING,
});

describe('ReupMediaUploadHook', () => {
  let videos: { findById: jest.Mock; update: jest.Mock };
  let auditService: { log: jest.Mock };
  let hook: ReupMediaUploadHook;

  beforeEach(() => {
    videos = {
      findById: jest.fn().mockResolvedValue(makeVideo()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    hook = new ReupMediaUploadHook(
      videos as unknown as ReupVideosRepository,
      auditService as unknown as AuditService,
    );
  });

  /**
   * HỒI QUY — điều kiện Done của plan 29 (§6 R1): upload tay đi qua đúng hook này
   * và **không được** bị đụng vào bất cứ thứ gì.
   */
  describe('nhánh upload tay (reupVideoId = null)', () => {
    it('onJobSucceeded ⇒ không đọc, không ghi, không log audit', async () => {
      await hook.onJobSucceeded(makeJob({ reupVideoId: null }), 'content-1');

      expect(videos.findById).not.toHaveBeenCalled();
      expect(videos.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('onJobFailed ⇒ không đọc, không ghi', async () => {
      await hook.onJobFailed(makeJob({ reupVideoId: null }), 'lỗi', true);

      expect(videos.findById).not.toHaveBeenCalled();
      expect(videos.update).not.toHaveBeenCalled();
    });
  });

  describe('onJobSucceeded — video reup', () => {
    it('đánh IMPORTED, nối content_asset_id và xoá local_path', async () => {
      await hook.onJobSucceeded(makeJob(), 'content-9');

      expect(videos.update).toHaveBeenCalledWith('video-1', {
        status: ReupVideoStatus.IMPORTED,
        contentAssetId: 'content-9',
        localPath: null,
        errorMessage: null,
      });
    });

    it('ghi audit REUP_VIDEO_IMPORTED với actor = Bot (userId null)', async () => {
      await hook.onJobSucceeded(makeJob(), 'content-9');

      const payload = (auditService.log.mock.calls as unknown[][])[0][0] as {
        userId: string | null;
        action: string;
        afterValue: { contentAssetId: string; autoApproved: boolean };
      };
      expect(payload.userId).toBeNull();
      expect(payload.action).toBe(AuditAction.REUP_VIDEO_IMPORTED);
      expect(payload.afterValue.contentAssetId).toBe('content-9');
    });

    it('autoApprove = true ⇒ audit ghi autoApproved = true', async () => {
      await hook.onJobSucceeded(
        makeJob({ metadata: { autoApprove: true } } as never),
        'content-9',
      );

      const payload = (auditService.log.mock.calls as unknown[][])[0][0] as {
        afterValue: { autoApproved: boolean };
      };
      expect(payload.afterValue.autoApproved).toBe(true);
    });

    it('video đã bị xoá khỏi DB ⇒ bỏ qua êm, không ném lỗi', async () => {
      videos.findById.mockResolvedValue(null);

      await expect(
        hook.onJobSucceeded(makeJob(), 'content-9'),
      ).resolves.toBeUndefined();
      expect(videos.update).not.toHaveBeenCalled();
    });
  });

  describe('onJobFailed — video reup', () => {
    it('còn lượt retry ⇒ GIỮ trạng thái cũ, chỉ ghi errorMessage', async () => {
      await hook.onJobFailed(makeJob(), 'Drive lỗi', false);

      expect(videos.update).toHaveBeenCalledWith('video-1', {
        status: ReupVideoStatus.UPLOADING,
        errorMessage: 'Drive lỗi',
      });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('hết lượt ⇒ FAILED + audit REUP_VIDEO_FAILED', async () => {
      await hook.onJobFailed(makeJob(), 'Drive lỗi', true);

      expect(videos.update).toHaveBeenCalledWith('video-1', {
        status: ReupVideoStatus.FAILED,
        errorMessage: 'Drive lỗi',
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.REUP_VIDEO_FAILED }),
      );
    });
  });
});
