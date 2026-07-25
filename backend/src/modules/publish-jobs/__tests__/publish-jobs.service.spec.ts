import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  MediaType,
  PublishJobEventType,
  PublishStatus,
  UserRole,
  type ContentAsset,
  type FacebookPage,
  type PublishJob,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { PublishJobEventsService } from '../publish-job-events.service';
import type {
  JobWithContext,
  PublishJobsRepository,
} from '../publish-jobs.repository';
import { PublishJobsService } from '../publish-jobs.service';
import type { PublishFacebookJobData } from '../publish-queue.constants';

const NOW = new Date('2026-07-25T07:30:00Z');

const ACTOR: AuthenticatedUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'System Admin',
  role: UserRole.ADMIN,
};

const makeContent = (overrides: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: 'content-1',
    title: 'Ảnh khai trương',
    caption: 'Caption',
    hashtags: '#tag',
    category: 'Review',
    mediaType: MediaType.image,
    status: 'APPROVED',
    ...overrides,
  }) as ContentAsset;

const makePage = (overrides: Partial<FacebookPage> = {}): FacebookPage =>
  ({
    id: 'page-1',
    pageName: 'Cửa hàng cây cảnh',
    pageId: '111367907895365',
    isActive: true,
    deletedAt: null,
    ...overrides,
  }) as FacebookPage;

const makeJob = (overrides: Partial<JobWithContext> = {}): JobWithContext => ({
  id: 'job-1',
  contentAssetId: 'content-1',
  facebookPageId: 'page-1',
  caption: 'Caption',
  hashtags: '#tag',
  scheduleTime: NOW,
  status: PublishStatus.FAILED,
  publishedAt: null,
  facebookPostId: null,
  errorMessage: 'Facebook trả lỗi (#190)',
  attemptCount: 3,
  bullJobId: 'publish-job-1',
  createdBy: 'Bot',
  createdAt: NOW,
  updatedAt: NOW,
  contentAsset: makeContent(),
  facebookPage: makePage(),
  ...(overrides as Partial<PublishJob>),
});

describe('PublishJobsService', () => {
  let repository: jest.Mocked<
    Pick<
      PublishJobsRepository,
      | 'create'
      | 'setBullJobId'
      | 'findById'
      | 'findForExecution'
      | 'requeue'
      | 'hasPublishedAssignment'
    >
  >;
  let events: jest.Mocked<Pick<PublishJobEventsService, 'log'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let queue: jest.Mocked<Pick<Queue<PublishFacebookJobData>, 'add' | 'remove'>>;
  let service: PublishJobsService;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(makeJob()),
      setBullJobId: jest.fn().mockResolvedValue(makeJob()),
      findById: jest.fn().mockResolvedValue(makeJob()),
      findForExecution: jest.fn().mockResolvedValue(makeJob()),
      requeue: jest.fn().mockResolvedValue(makeJob()),
      hasPublishedAssignment: jest.fn().mockResolvedValue(false),
    };
    events = { log: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-1' }),
      remove: jest.fn().mockResolvedValue(1),
    };

    service = new PublishJobsService(
      repository as unknown as PublishJobsRepository,
      events as unknown as PublishJobEventsService,
      auditService as unknown as AuditService,
      queue as unknown as Queue<PublishFacebookJobData>,
    );
  });

  describe('retry', () => {
    it('job FAILED: đưa về QUEUED, dọn bull job cũ rồi xếp hàng lại với jobId mới', async () => {
      const result = await service.retry('job-1', ACTOR);

      expect(queue.remove).toHaveBeenCalledWith('publish-job-1');
      expect(repository.requeue).toHaveBeenCalledWith('job-1');
      const [, , options] = queue.add.mock.calls[0];
      // jobId mới, nếu trùng jobId cũ thì BullMQ bỏ qua ⇒ bấm nút mà không chạy.
      expect(options?.jobId).not.toBe('publish-job-1');
      expect(options?.jobId).toMatch(/^publish-job-1-retry-\d+$/);
      expect(options?.delay).toBe(0);
      expect(result.status).toBe(PublishStatus.QUEUED);
    });

    it('ghi nhật ký ENQUEUED kèm tên người bấm và audit PUBLISH_JOB_RETRY', async () => {
      await service.retry('job-1', ACTOR);

      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({
          publishJobId: 'job-1',
          attemptNo: 1,
          event: PublishJobEventType.ENQUEUED,
          message: 'Đăng lại thủ công bởi System Admin',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: AuditAction.PUBLISH_JOB_RETRY,
          resource: 'publish_job:job-1',
        }),
      );
    });

    it('job CANCELLED cũng đăng lại được', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ status: PublishStatus.CANCELLED }),
      );

      await expect(service.retry('job-1', ACTOR)).resolves.toMatchObject({
        status: PublishStatus.QUEUED,
      });
    });

    it('không tìm thấy job ⇒ NotFoundException', async () => {
      repository.findForExecution.mockResolvedValue(null);

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('job đã SUCCESS ⇒ ConflictException, không đăng chồng lên page', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ status: PublishStatus.SUCCESS }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.requeue).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it.each([PublishStatus.QUEUED, PublishStatus.PUBLISHING])(
      'job đang %s (worker còn giữ) ⇒ ConflictException',
      async (status) => {
        repository.findForExecution.mockResolvedValue(makeJob({ status }));

        await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it('page đang tạm dừng ⇒ BadRequestException', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ facebookPage: makePage({ isActive: false }) }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('page đã bị xoá ⇒ BadRequestException', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ facebookPage: makePage({ deletedAt: NOW }) }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('bài đã đăng lên chính page đó qua đường khác ⇒ ConflictException', async () => {
      repository.hasPublishedAssignment.mockResolvedValue(true);

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.requeue).not.toHaveBeenCalled();
    });

    it('xoá bull job cũ hỏng (Redis đã dọn) vẫn đăng lại được', async () => {
      queue.remove.mockRejectedValue(new Error('job not found'));

      await expect(service.retry('job-1', ACTOR)).resolves.toMatchObject({
        status: PublishStatus.QUEUED,
      });
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('job chưa từng vào queue (bullJobId null) ⇒ không gọi remove', async () => {
      repository.findForExecution.mockResolvedValue(
        makeJob({ bullJobId: null }),
      );

      await service.retry('job-1', ACTOR);

      expect(queue.remove).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('findEvents', () => {
    it('job không tồn tại ⇒ NotFoundException', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findEvents('job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
