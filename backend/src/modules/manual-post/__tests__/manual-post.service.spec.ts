import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  MediaType,
  PublishStatus,
  UserRole,
  type ContentAsset,
  type ContentPageAssignment,
  type FacebookPage,
  type PublishJob,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type { DriveStorage } from '../../../infra/drive/drive-storage.interface';
import type { FacebookPublisherClient } from '../../../infra/facebook/facebook-publisher.client';
import type {
  PublishMediaInput,
  PublishResult,
} from '../../../infra/facebook/facebook-publisher.interface';
import { FacebookGraphError } from '../../../infra/facebook/facebook.errors';
import type { CreateAuditLogData } from '../../audit/audit.repository';
import type { AuditService } from '../../audit/audit.service';
import type { ContentAssetsRepository } from '../../content-assets/content-assets.repository';
import type { FacebookPagesRepository } from '../../facebook-pages/facebook-pages.repository';
import type { FacebookPagesService } from '../../facebook-pages/facebook-pages.service';
import type {
  CreateManualJobData,
  ManualPostRepository,
  MarkPublishedData,
} from '../manual-post.repository';
import { ManualPostService } from '../manual-post.service';

const editor: AuthenticatedUser = {
  id: 'user-1',
  email: 'editor@company.local',
  name: 'Chị Editor',
  role: UserRole.EDITOR,
};

const makeContent = (overrides: Partial<ContentAsset> = {}): ContentAsset => ({
  id: 'content-1',
  title: 'Ảnh khai trương',
  description: null,
  caption: 'Caption gốc',
  hashtags: '#gốc',
  category: 'Thăm khám',
  mediaType: MediaType.image,
  driveFileId: 'drive-1',
  driveUrl: null,
  thumbnailUrl: null,
  mimeType: 'image/png',
  fileSize: null,
  status: 'PENDING_REVIEW',
  isAds: false,
  rejectComment: null,
  createdById: 'user-1',
  approvedById: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makePage = (overrides: Partial<FacebookPage> = {}): FacebookPage => ({
  id: 'page-1',
  pageName: 'Cửa hàng cây cảnh',
  pageId: '111367907895365',
  accessTokenEnc: 'enc',
  tokenExpireAt: null,
  isActive: true,
  autopostEnabled: false,
  deletedAt: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeJob = (): PublishJob =>
  ({ id: 'job-1', status: PublishStatus.PUBLISHING }) as PublishJob;

const dto = {
  pageId: 'page-1',
  contentAssetId: 'content-1',
  caption: 'Caption đã sửa',
  hashtags: '#moi',
};

describe('ManualPostService', () => {
  let repository: {
    findAssignment: jest.Mock<
      Promise<ContentPageAssignment | null>,
      [string, string]
    >;
    createPublishingJob: jest.Mock<Promise<PublishJob>, [CreateManualJobData]>;
    markPublished: jest.Mock<Promise<PublishJob>, [MarkPublishedData]>;
    markFailed: jest.Mock<Promise<PublishJob>, [string, string]>;
  };
  let contentRepository: {
    findById: jest.Mock<Promise<ContentAsset | null>, [string]>;
  };
  let pagesRepository: {
    findById: jest.Mock<Promise<FacebookPage | null>, [string]>;
  };
  let pagesService: { getDecryptedToken: jest.Mock<Promise<string>, [string]> };
  let storage: { createReadStream: jest.Mock<Promise<Readable>, [string]> };
  let driveFactory: { get: jest.Mock<Promise<DriveStorage>, []> };
  let publisher: {
    publishImage: jest.Mock<Promise<PublishResult>, [PublishMediaInput]>;
    publishVideo: jest.Mock<Promise<PublishResult>, [PublishMediaInput]>;
  };
  let auditService: { log: jest.Mock<Promise<void>, [CreateAuditLogData]> };
  let service: ManualPostService;

  beforeEach(() => {
    repository = {
      findAssignment: jest.fn<
        Promise<ContentPageAssignment | null>,
        [string, string]
      >(),
      createPublishingJob: jest.fn<
        Promise<PublishJob>,
        [CreateManualJobData]
      >(),
      markPublished: jest.fn<Promise<PublishJob>, [MarkPublishedData]>(),
      markFailed: jest.fn<Promise<PublishJob>, [string, string]>(),
    };
    contentRepository = {
      findById: jest.fn<Promise<ContentAsset | null>, [string]>(),
    };
    pagesRepository = {
      findById: jest.fn<Promise<FacebookPage | null>, [string]>(),
    };
    pagesService = {
      getDecryptedToken: jest.fn<Promise<string>, [string]>(),
    };
    storage = { createReadStream: jest.fn<Promise<Readable>, [string]>() };
    driveFactory = { get: jest.fn<Promise<DriveStorage>, []>() };
    publisher = {
      publishImage: jest.fn<Promise<PublishResult>, [PublishMediaInput]>(),
      publishVideo: jest.fn<Promise<PublishResult>, [PublishMediaInput]>(),
    };
    auditService = { log: jest.fn<Promise<void>, [CreateAuditLogData]>() };

    contentRepository.findById.mockResolvedValue(makeContent());
    pagesRepository.findById.mockResolvedValue(makePage());
    repository.findAssignment.mockResolvedValue(null);
    repository.createPublishingJob.mockResolvedValue(makeJob());
    repository.markPublished.mockResolvedValue(makeJob());
    repository.markFailed.mockResolvedValue(makeJob());
    pagesService.getDecryptedToken.mockResolvedValue('page-token');
    storage.createReadStream.mockResolvedValue(
      Readable.from([Buffer.from('file-bytes')]),
    );
    driveFactory.get.mockResolvedValue(storage as unknown as DriveStorage);
    publisher.publishImage.mockResolvedValue({ postId: '111_222' });
    publisher.publishVideo.mockResolvedValue({ postId: 'video-1' });
    auditService.log.mockResolvedValue(undefined);

    service = new ManualPostService(
      repository as unknown as ManualPostRepository,
      contentRepository as unknown as ContentAssetsRepository,
      pagesRepository as unknown as FacebookPagesRepository,
      pagesService as unknown as FacebookPagesService,
      driveFactory as unknown as DriveStorageFactory,
      publisher as unknown as FacebookPublisherClient,
      auditService as unknown as AuditService,
    );
  });

  describe('publishNow', () => {
    it('đăng ảnh: gọi publishImage với caption + hashtag đã ghép và đánh dấu job SUCCESS', async () => {
      const result = await service.publishNow(dto, editor);

      const input = publisher.publishImage.mock.calls[0][0];
      expect(input.pageId).toBe('111367907895365');
      expect(input.accessToken).toBe('page-token');
      expect(input.message).toBe('Caption đã sửa\n\n#moi');
      expect(input.file.mimeType).toBe('image/png');
      expect(publisher.publishVideo).not.toHaveBeenCalled();

      const marked = repository.markPublished.mock.calls[0][0];
      expect(marked.jobId).toBe('job-1');
      expect(marked.facebookPostId).toBe('111_222');
      expect(result.facebookPostId).toBe('111_222');
    });

    it('bài video thì gọi publishVideo chứ không phải publishImage', async () => {
      contentRepository.findById.mockResolvedValue(
        makeContent({ mediaType: MediaType.video, mimeType: 'video/mp4' }),
      );

      await service.publishNow(dto, editor);

      expect(publisher.publishVideo).toHaveBeenCalledTimes(1);
      expect(publisher.publishImage).not.toHaveBeenCalled();
    });

    it('không có hashtag thì message chỉ là caption', async () => {
      await service.publishNow({ ...dto, hashtags: '   ' }, editor);

      expect(publisher.publishImage.mock.calls[0][0].message).toBe(
        'Caption đã sửa',
      );
    });

    it('ném ConflictException khi bài đã đăng lên chính page đó', async () => {
      repository.findAssignment.mockResolvedValue({
        publishedAt: new Date('2026-07-01'),
      } as ContentPageAssignment);

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.createPublishingJob).not.toHaveBeenCalled();
      expect(publisher.publishImage).not.toHaveBeenCalled();
    });

    it('cho đăng khi đã có assignment nhưng chưa publish', async () => {
      repository.findAssignment.mockResolvedValue({
        publishedAt: null,
      } as ContentPageAssignment);

      await service.publishNow(dto, editor);

      expect(publisher.publishImage).toHaveBeenCalledTimes(1);
    });

    it('ném BadRequestException khi page đang tạm dừng', async () => {
      pagesRepository.findById.mockResolvedValue(makePage({ isActive: false }));

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(publisher.publishImage).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi không tìm thấy bài', async () => {
      contentRepository.findById.mockResolvedValue(null);

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ném NotFoundException khi không tìm thấy page', async () => {
      pagesRepository.findById.mockResolvedValue(null);

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lỗi Facebook ⇒ job FAILED kèm message, không đụng content/assignment', async () => {
      publisher.publishImage.mockRejectedValue(
        new FacebookGraphError('Access token đã hết hạn'),
      );

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      expect(repository.markFailed).toHaveBeenCalledWith(
        'job-1',
        'Access token đã hết hạn',
      );
      expect(repository.markPublished).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('lỗi đọc file Drive ⇒ job FAILED, không gọi Facebook', async () => {
      storage.createReadStream.mockRejectedValue(
        new BadRequestException('Không đọc được file trên Drive'),
      );

      await expect(service.publishNow(dto, editor)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      expect(repository.markFailed).toHaveBeenCalledWith(
        'job-1',
        'Không đọc được file trên Drive',
      );
      expect(publisher.publishImage).not.toHaveBeenCalled();
    });

    it('ghi audit MANUAL_PUBLISH với người bấm nút, job tạo ra mang tên người đó', async () => {
      await service.publishNow(dto, editor);

      expect(repository.createPublishingJob.mock.calls[0][0].createdBy).toBe(
        'Chị Editor',
      );
      const log = auditService.log.mock.calls[0][0];
      expect(log.action).toBe('MANUAL_PUBLISH');
      expect(log.userId).toBe('user-1');
    });
  });
});
