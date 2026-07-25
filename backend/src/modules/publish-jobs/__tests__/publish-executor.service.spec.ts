import {
  MediaType,
  PublishJobEventType,
  PublishStatus,
  type ContentAsset,
  type FacebookPage,
  type PublishJob,
} from '../../../../generated/prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { FacebookPagesService } from '../../facebook-pages/facebook-pages.service';
import { FacebookGraphError } from '../../../infra/facebook/facebook.errors';
import {
  PublishExecutionError,
  PublishExecutorService,
} from '../publish-executor.service';
import type { PublishJobEventsService } from '../publish-job-events.service';
import type {
  JobWithContext,
  PublishJobsRepository,
} from '../publish-jobs.repository';
import type { PublishMediaService } from '../publish-media.service';

const NOW = new Date('2026-07-25T07:30:00Z');

const makeContent = (overrides: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: 'content-1',
    title: 'Ảnh khai trương',
    caption: 'Caption',
    hashtags: '#tag',
    category: 'Review',
    mediaType: MediaType.image,
    driveFileId: 'drive-1',
    mimeType: 'image/png',
    status: 'APPROVED',
    ...overrides,
  }) as ContentAsset;

const makePage = (): FacebookPage =>
  ({
    id: 'page-1',
    pageName: 'Cửa hàng cây cảnh',
    pageId: '111367907895365',
    isActive: true,
  }) as FacebookPage;

const makeJob = (overrides: Partial<PublishJob> = {}): JobWithContext => ({
  id: 'job-1',
  contentAssetId: 'content-1',
  facebookPageId: 'page-1',
  caption: 'Caption',
  hashtags: '#tag',
  scheduleTime: NOW,
  status: PublishStatus.QUEUED,
  publishedAt: null,
  facebookPostId: null,
  errorMessage: null,
  attemptCount: 0,
  bullJobId: null,
  createdBy: 'Bot',
  createdAt: NOW,
  updatedAt: NOW,
  contentAsset: makeContent(),
  facebookPage: makePage(),
  ...overrides,
});

describe('PublishExecutorService', () => {
  let repository: jest.Mocked<
    Pick<
      PublishJobsRepository,
      'findForExecution' | 'markPublishing' | 'markSuccess' | 'markFailure'
    >
  >;
  let events: jest.Mocked<Pick<PublishJobEventsService, 'log'>>;
  let pagesService: jest.Mocked<
    Pick<FacebookPagesService, 'getDecryptedToken'>
  >;
  let publishMedia: jest.Mocked<Pick<PublishMediaService, 'publish'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let service: PublishExecutorService;

  const loggedEvents = (): PublishJobEventType[] =>
    events.log.mock.calls.map((call) => call[0].event);

  beforeEach(() => {
    repository = {
      findForExecution: jest.fn().mockResolvedValue(makeJob()),
      markPublishing: jest.fn().mockResolvedValue(undefined),
      markSuccess: jest.fn().mockResolvedValue(makeJob()),
      markFailure: jest.fn().mockResolvedValue(undefined),
    };
    events = { log: jest.fn().mockResolvedValue(undefined) };
    pagesService = {
      getDecryptedToken: jest.fn().mockResolvedValue('page-token'),
    };
    publishMedia = {
      publish: jest.fn().mockResolvedValue({ postId: '111_222' }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new PublishExecutorService(
      repository as unknown as PublishJobsRepository,
      events as unknown as PublishJobEventsService,
      pagesService as unknown as FacebookPagesService,
      publishMedia as unknown as PublishMediaService,
      auditService as unknown as AuditService,
    );
  });

  describe('execute — thành công', () => {
    it('đăng ảnh: đổi sang PUBLISHING, gọi Graph rồi ghi SUCCESS + assignment', async () => {
      const result = await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(repository.markPublishing).toHaveBeenCalledWith(
        'job-1',
        'content-1',
        1,
      );
      expect(publishMedia.publish).toHaveBeenCalledTimes(1);
      const markSuccessArg = repository.markSuccess.mock.calls[0][0];
      expect(markSuccessArg.facebookPostId).toBe('111_222');
      expect(markSuccessArg.facebookPageId).toBe('page-1');
      expect(result.status).toBe('success');
    });

    it('đăng video đi qua đúng đường publish dùng chung với nội dung video', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({
          contentAsset: makeContent({ mediaType: MediaType.video }),
        } as Partial<PublishJob>),
      );

      await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(publishMedia.publish.mock.calls[0][0].content.mediaType).toBe(
        MediaType.video,
      );
    });

    it('ghi audit AUTO_PUBLISH với userId null vì actor là Bot', async () => {
      await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      const log = auditService.log.mock.calls[0][0];
      expect(log.userId).toBeNull();
      expect(log.action).toBe('AUTO_PUBLISH');
    });

    it('ghi nhật ký STARTED rồi SUCCEEDED', async () => {
      await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(loggedEvents()).toEqual([
        PublishJobEventType.STARTED,
        PublishJobEventType.SUCCEEDED,
      ]);
    });
  });

  describe('execute — idempotent', () => {
    it('job đã SUCCESS ⇒ KHÔNG gọi Facebook lần nữa', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ status: PublishStatus.SUCCESS }),
      );

      const result = await service.execute({
        publishJobId: 'job-1',
        attemptNo: 2,
        isLastAttempt: false,
      });

      expect(publishMedia.publish).not.toHaveBeenCalled();
      expect(repository.markPublishing).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
    });

    it('job đã CANCELLED ⇒ bỏ qua', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ status: PublishStatus.CANCELLED }),
      );

      const result = await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(publishMedia.publish).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
    });

    it('job không còn trong DB ⇒ bỏ qua, không nổ', async () => {
      repository.findForExecution.mockResolvedValue(null);

      const result = await service.execute({
        publishJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(result.status).toBe('skipped');
      expect(publishMedia.publish).not.toHaveBeenCalled();
    });
  });

  describe('execute — thất bại', () => {
    it('lỗi Facebook còn lượt thử ⇒ job về QUEUED, ghi RETRY_SCHEDULED và ném lỗi', async () => {
      publishMedia.publish.mockRejectedValue(
        new FacebookGraphError('Access token đã hết hạn', 190),
      );

      await expect(
        service.execute({
          publishJobId: 'job-1',
          attemptNo: 1,
          isLastAttempt: false,
        }),
      ).rejects.toBeInstanceOf(PublishExecutionError);

      const failure = repository.markFailure.mock.calls[0][1];
      expect(failure.status).toBe(PublishStatus.QUEUED);
      expect(failure.errorMessage).toBe('Access token đã hết hạn');
      expect(failure.attemptCount).toBe(1);
      expect(loggedEvents()).toEqual([
        PublishJobEventType.STARTED,
        PublishJobEventType.FAILED,
        PublishJobEventType.RETRY_SCHEDULED,
      ]);
    });

    it('hết lượt thử ⇒ job FAILED và ghi GAVE_UP', async () => {
      publishMedia.publish.mockRejectedValue(new Error('Graph 500'));

      await expect(
        service.execute({
          publishJobId: 'job-1',
          attemptNo: 3,
          isLastAttempt: true,
        }),
      ).rejects.toThrow('Graph 500');

      expect(repository.markFailure.mock.calls[0][1].status).toBe(
        PublishStatus.FAILED,
      );
      expect(loggedEvents()).toContain(PublishJobEventType.GAVE_UP);
      expect(loggedEvents()).not.toContain(PublishJobEventType.RETRY_SCHEDULED);
    });

    it('lỗi lấy token cũng vào đúng đường thất bại, không gọi Graph', async () => {
      pagesService.getDecryptedToken.mockRejectedValue(
        new Error('Page đang tạm dừng'),
      );

      await expect(
        service.execute({
          publishJobId: 'job-1',
          attemptNo: 1,
          isLastAttempt: true,
        }),
      ).rejects.toThrow('Page đang tạm dừng');

      expect(publishMedia.publish).not.toHaveBeenCalled();
      expect(repository.markFailure).toHaveBeenCalledTimes(1);
    });

    it('lỗi thất bại vẫn ghi rawError để điều tra', async () => {
      const error = new FacebookGraphError('Sai Page ID', 10);
      publishMedia.publish.mockRejectedValue(error);

      await expect(
        service.execute({
          publishJobId: 'job-1',
          attemptNo: 1,
          isLastAttempt: true,
        }),
      ).rejects.toThrow();

      const failedEvent = events.log.mock.calls.find(
        (call) => call[0].event === PublishJobEventType.FAILED,
      );
      expect(failedEvent?.[0].rawError).toBe(error);
    });
  });
});
