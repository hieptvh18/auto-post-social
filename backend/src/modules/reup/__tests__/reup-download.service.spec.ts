import {
  MediaUploadSource,
  ReupPlatform,
  ReupVideoStatus,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import { ReupVideoUnavailableError } from '../../../infra/reup-downloader/reup-downloader.errors';
import type { ReupDownloaderPort } from '../../../infra/reup-downloader/reup-downloader.interface';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { MediaUploadJobsRepository } from '../../media-upload-jobs/media-upload-jobs.repository';
import { ReupDownloadService } from '../reup-download.service';
import type { ReupTopicsRepository } from '../reup-topics.repository';
import type { ReupVideosRepository } from '../reup-videos.repository';

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
}));

const makeVideo = (overrides = {}) => ({
  id: 'video-1',
  topicId: 'topic-1',
  platform: ReupPlatform.YOUTUBE,
  externalId: 'abc',
  sourceUrl: 'https://www.youtube.com/watch?v=abc',
  title: 'Mẹo nấu ăn ngon',
  authorName: 'Kênh A',
  status: ReupVideoStatus.PENDING,
  topic: { id: 'topic-1', name: 'Mẹo nấu ăn', platform: ReupPlatform.YOUTUBE },
  ...overrides,
});

const makeTopic = (overrides = {}) => ({
  id: 'topic-1',
  name: 'Mẹo nấu ăn',
  category: 'Ẩm thực',
  captionTemplate: null,
  hashtags: null,
  autoApprove: false,
  createdById: 'super-1',
  ...overrides,
});

describe('ReupDownloadService', () => {
  let videos: { findById: jest.Mock; update: jest.Mock };
  let topics: { findById: jest.Mock };
  let mediaJobs: { create: jest.Mock };
  let downloader: { download: jest.Mock };
  let mediaQueue: { add: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: ReupDownloadService;

  const input = { reupVideoId: 'video-1', attemptNo: 1, isLastAttempt: false };

  beforeEach(() => {
    jest.clearAllMocks();
    videos = {
      findById: jest.fn().mockResolvedValue(makeVideo()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    topics = { findById: jest.fn().mockResolvedValue(makeTopic()) };
    mediaJobs = { create: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    downloader = {
      download: jest.fn().mockResolvedValue({
        filePath: '/tmp/reup/video-1/index.mp4',
        fileSize: 12_345,
        mimeType: 'video/mp4',
      }),
    };
    mediaQueue = { add: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ReupDownloadService(
      videos as unknown as ReupVideosRepository,
      topics as unknown as ReupTopicsRepository,
      mediaJobs as unknown as MediaUploadJobsRepository,
      { reup: { tmpDir: '/tmp/reup' } } as unknown as AppConfigService,
      auditService as unknown as AuditService,
      downloader as unknown as ReupDownloaderPort,
      mediaQueue as unknown as never,
    );
  });

  const createArg = (): {
    source: string;
    reupVideoId: string;
    createdById: string;
    metadata: {
      sourceType: string;
      autoApprove: boolean;
      caption: string;
      category: string;
    };
  } => (mediaJobs.create.mock.calls as unknown[][])[0][0] as never;

  describe('luồng thành công', () => {
    it('tải về thư mục RIÊNG theo video (cạm bẫy C5)', async () => {
      await service.process(input);

      expect(downloader.download).toHaveBeenCalledWith({
        url: 'https://www.youtube.com/watch?v=abc',
        outDir: '/tmp/reup/video-1',
      });
    });

    it('tạo MediaUploadJob với source = REUP và nối ngược reupVideoId', async () => {
      await service.process(input);

      expect(createArg().source).toBe(MediaUploadSource.REUP);
      expect(createArg().reupVideoId).toBe('video-1');
    });

    /** §6 R2: sai chỗ này là bài reup lọt vào màn kho của mọi role. */
    it('metadata mang sourceType = REUP để bài được set NGAY LÚC tạo', async () => {
      await service.process(input);

      expect(createArg().metadata.sourceType).toBe('REUP');
    });

    it.each([
      [true, true],
      [false, false],
    ])(
      'autoApprove của chủ đề = %s ⇒ metadata.autoApprove = %s',
      async (topicValue, expected) => {
        topics.findById.mockResolvedValue(
          makeTopic({ autoApprove: topicValue }),
        );

        await service.process(input);

        expect(createArg().metadata.autoApprove).toBe(expected);
      },
    );

    it('bài thuộc về người khai chủ đề (truy vết được ownership)', async () => {
      await service.process(input);

      expect(createArg().createdById).toBe('super-1');
    });

    it('category lấy từ chủ đề', async () => {
      await service.process(input);

      expect(createArg().metadata.category).toBe('Ẩm thực');
    });

    it('captionTemplate rỗng ⇒ caption = tiêu đề video gốc', async () => {
      await service.process(input);

      expect(createArg().metadata.caption).toBe('Mẹo nấu ăn ngon');
    });

    it('captionTemplate có {title} ⇒ thay bằng tiêu đề video', async () => {
      topics.findById.mockResolvedValue(
        makeTopic({ captionTemplate: 'Xem ngay: {title} #reup' }),
      );

      await service.process(input);

      expect(createArg().metadata.caption).toBe(
        'Xem ngay: Mẹo nấu ăn ngon #reup',
      );
    });

    it('đẩy job vào hàng đợi media-upload có sẵn (QĐ-3)', async () => {
      await service.process(input);

      expect(mediaQueue.add).toHaveBeenCalledTimes(1);
    });

    it('đi qua đủ chuỗi trạng thái DOWNLOADING → DOWNLOADED → UPLOADING', async () => {
      await service.process(input);

      const statuses = (videos.update.mock.calls as unknown[][]).map(
        (call) => (call[1] as { status?: string }).status,
      );
      expect(statuses).toEqual([
        ReupVideoStatus.DOWNLOADING,
        ReupVideoStatus.DOWNLOADED,
        ReupVideoStatus.UPLOADING,
      ]);
    });
  });

  describe('chống chạy trùng', () => {
    it.each([
      ReupVideoStatus.DOWNLOADING,
      ReupVideoStatus.IMPORTED,
      ReupVideoStatus.SKIPPED,
    ])('video đang ở %s ⇒ bỏ qua, KHÔNG tải lại', async (status) => {
      videos.findById.mockResolvedValue(makeVideo({ status }));

      await service.process(input);

      expect(downloader.download).not.toHaveBeenCalled();
      expect(mediaJobs.create).not.toHaveBeenCalled();
    });

    it('video không còn tồn tại ⇒ thoát êm', async () => {
      videos.findById.mockResolvedValue(null);

      await expect(service.process(input)).resolves.toBeUndefined();
      expect(downloader.download).not.toHaveBeenCalled();
    });
  });

  describe('tải hỏng', () => {
    beforeEach(() => {
      downloader.download.mockRejectedValue(
        new ReupVideoUnavailableError('video bị gỡ'),
      );
    });

    it('còn lượt retry ⇒ trả về PENDING để lượt sau chạy tiếp', async () => {
      await expect(
        service.process({ ...input, isLastAttempt: false }),
      ).rejects.toBeInstanceOf(ReupVideoUnavailableError);

      const last = (videos.update.mock.calls as unknown[][]).at(-1);
      expect((last?.[1] as { status: string }).status).toBe(
        ReupVideoStatus.PENDING,
      );
    });

    it('hết lượt ⇒ FAILED + audit REUP_VIDEO_FAILED', async () => {
      await expect(
        service.process({ ...input, isLastAttempt: true }),
      ).rejects.toBeInstanceOf(ReupVideoUnavailableError);

      const last = (videos.update.mock.calls as unknown[][]).at(-1);
      expect((last?.[1] as { status: string }).status).toBe(
        ReupVideoStatus.FAILED,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.REUP_VIDEO_FAILED }),
      );
    });

    it('KHÔNG tạo MediaUploadJob khi tải hỏng', async () => {
      await expect(service.process(input)).rejects.toThrow();

      expect(mediaJobs.create).not.toHaveBeenCalled();
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('chủ đề đã bị xoá ⇒ đánh hỏng, không tải', async () => {
      topics.findById.mockResolvedValue(null);

      await service.process(input);

      expect(downloader.download).not.toHaveBeenCalled();
      expect(videos.update).toHaveBeenCalledWith(
        'video-1',
        expect.objectContaining({ status: ReupVideoStatus.FAILED }),
      );
    });
  });
});
