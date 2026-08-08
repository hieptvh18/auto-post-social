import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  MediaType,
  MediaUploadSource,
  MediaUploadStatus,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AppConfigService } from '../../../config/app-config.service';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type {
  DriveFileMeta,
  DriveStorage,
} from '../../../infra/drive/drive-storage.interface';
import { DriveFileError } from '../../../infra/drive/drive.errors';
import type { ContentAssetsService } from '../../content-assets/content-assets.service';
import type { SettingsService } from '../../settings/settings.service';
import { DriveImportsService } from '../drive-imports.service';
import type { MediaUploadJobData } from '../media-upload.constants';
import type {
  MediaUploadJobRecord,
  MediaUploadJobsRepository,
} from '../media-upload-jobs.repository';
import type { MediaUploadJobsService } from '../media-upload-jobs.service';

const NOW = new Date('2026-08-07T10:00:00.000Z');
const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz01234';
const FILE_ID_2 = '1ZzYyXxWwVvUuTtSsRrQqPpOoNnMmLl';
const ACCOUNT_EMAIL = 'tool-drive@example.com';
const MB = 1024 * 1024;

const ACTOR: AuthenticatedUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Quản trị',
  role: 'ADMIN',
};

const linkOf = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

const makeMeta = (overrides: Partial<DriveFileMeta> = {}): DriveFileMeta => ({
  fileId: FILE_ID,
  name: 'clip-khai-truong.mp4',
  mimeType: 'video/mp4',
  size: 50 * MB,
  canCopy: true,
  shortcutTargetId: null,
  webViewLink: 'https://drive.google.com/file/d/goc-1/view',
  thumbnailLink: 'https://drive/goc-1/thumb',
  ...overrides,
});

const makeJob = (
  overrides: Partial<MediaUploadJobRecord> = {},
): MediaUploadJobRecord => ({
  id: 'job-1',
  status: MediaUploadStatus.QUEUED,
  source: MediaUploadSource.DRIVE_LINK,
  originalFilename: 'clip-khai-truong.mp4',
  fileCount: 1,
  totalSize: BigInt(50 * MB),
  files: [
    {
      originalFilename: 'clip-khai-truong.mp4',
      mimeType: 'video/mp4',
      size: 50 * MB,
      sourceFileId: FILE_ID,
    },
  ],
  metadata: {
    title: 'clip-khai-truong',
    category: 'Review',
    caption: 'Caption đăng bài',
    assignedPageIds: [],
    // Job mẫu = chế độ copy; luồng "chỉ lưu link" có describe riêng bên dưới.
    copyToDrive: true,
  },
  errorMessage: null,
  attemptCount: 0,
  bullJobId: null,
  filesRemovedAt: null,
  contentAssetId: null,
  createdById: ACTOR.id,
  createdBy: {
    id: ACTOR.id,
    name: ACTOR.name,
    email: ACTOR.email,
    role: 'ADMIN',
  },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

interface Mocks {
  repository: jest.Mocked<
    Pick<
      MediaUploadJobsRepository,
      'create' | 'update' | 'findImportedSourceFiles'
    >
  >;
  jobsService: jest.Mocked<Pick<MediaUploadJobsService, 'runJob'>>;
  contentAssets: jest.Mocked<Pick<ContentAssetsService, 'create'>>;
  storage: jest.Mocked<Pick<DriveStorage, 'getMetadata' | 'copy'>>;
  settings: jest.Mocked<
    Pick<SettingsService, 'getDriveConfig' | 'getDriveAccountEmail'>
  >;
  queue: jest.Mocked<Pick<Queue<MediaUploadJobData>, 'add'>>;
}

const build = (
  overrides: Partial<Mocks> = {},
): { service: DriveImportsService } & Mocks => {
  const repository: Mocks['repository'] = {
    create: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => makeJob(data)),
    update: jest.fn().mockResolvedValue(makeJob()),
    findImportedSourceFiles: jest.fn().mockResolvedValue([]),
    ...overrides.repository,
  };

  const jobsService: Mocks['jobsService'] = {
    runJob: jest.fn().mockResolvedValue(undefined),
    ...overrides.jobsService,
  };

  const contentAssets: Mocks['contentAssets'] = {
    create: jest.fn().mockResolvedValue({ id: 'content-1' }),
    ...overrides.contentAssets,
  };

  const storage: Mocks['storage'] = {
    getMetadata: jest.fn().mockResolvedValue(makeMeta()),
    copy: jest.fn().mockResolvedValue({
      fileId: 'copy-1',
      name: 'clip-khai-truong.mp4',
      mimeType: 'video/mp4',
      size: 50 * MB,
      webViewLink: 'https://drive/copy-1',
      thumbnailLink: 'https://drive/copy-1/thumb',
    }),
    ...overrides.storage,
  };

  const settings: Mocks['settings'] = {
    getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 500 }),
    getDriveAccountEmail: jest.fn().mockResolvedValue(ACCOUNT_EMAIL),
    ...overrides.settings,
  };

  const queue: Mocks['queue'] = {
    add: jest.fn().mockResolvedValue(undefined),
    ...overrides.queue,
  };

  const service = new DriveImportsService(
    repository as unknown as MediaUploadJobsRepository,
    jobsService as unknown as MediaUploadJobsService,
    contentAssets as unknown as ContentAssetsService,
    {
      get: jest.fn().mockResolvedValue(storage),
    } as unknown as DriveStorageFactory,
    settings as unknown as SettingsService,
    {
      driveImport: { concurrency: 5, maxLinksPerRequest: 50 },
    } as unknown as AppConfigService,
    queue as unknown as Queue<MediaUploadJobData>,
  );

  return {
    service,
    repository,
    jobsService,
    contentAssets,
    storage,
    settings,
    queue,
  };
};

beforeEach(() => jest.clearAllMocks());

describe('DriveImportsService', () => {
  describe('createJobs — soi từng dòng link', () => {
    it('dòng hợp lệ ⇒ tạo job DRIVE_LINK, tiêu đề = tên file bỏ đuôi', async () => {
      const { service, repository, queue } = build();

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.skipped).toEqual([]);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: MediaUploadSource.DRIVE_LINK,
          createdById: ACTOR.id,
        }),
      );
      const created = repository.create.mock.calls[0][0];
      expect(created.metadata.title).toBe('clip-khai-truong');
      expect(created.files[0].sourceFileId).toBe(FILE_ID);
      // Không đường dẫn tạm ⇒ không byte nào chạm đĩa server (plan 24 §0.1).
      expect(created.files[0].tempPath).toBeUndefined();
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('không truyền copyData ⇒ job ghi copyToDrive = false (chỉ lưu link)', async () => {
      const { service, repository } = build();

      await service.createJobs({ links: [linkOf(FILE_ID)] }, ACTOR);

      const created = repository.create.mock.calls[0][0];
      expect(created.metadata.copyToDrive).toBe(false);
      // Link/thumbnail gốc được giữ lại để worker không phải gọi Drive lần nữa.
      expect(created.files[0].sourceWebViewLink).toBe(
        'https://drive.google.com/file/d/goc-1/view',
      );
      expect(created.files[0].sourceThumbnailLink).toBe(
        'https://drive/goc-1/thumb',
      );
    });

    it('copyData = true ⇒ job ghi copyToDrive = true', async () => {
      const { service, repository } = build();

      await service.createJobs(
        { links: [linkOf(FILE_ID)], copyData: true },
        ACTOR,
      );

      expect(repository.create.mock.calls[0][0].metadata.copyToDrive).toBe(
        true,
      );
    });

    it('mặc định N dòng ⇒ N bài riêng', async () => {
      const { service, repository } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(
              makeMeta({ name: 'a.jpg', mimeType: 'image/jpeg' }),
            )
            .mockResolvedValueOnce(
              makeMeta({
                fileId: FILE_ID_2,
                name: 'b.jpg',
                mimeType: 'image/jpeg',
              }),
            ),
          copy: jest.fn(),
        },
      });

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID), linkOf(FILE_ID_2)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(2);
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('bật gộp ⇒ MỘT job chứa cả N ảnh', async () => {
      const { service, repository } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(
              makeMeta({ name: 'a.jpg', mimeType: 'image/jpeg' }),
            )
            .mockResolvedValueOnce(
              makeMeta({
                fileId: FILE_ID_2,
                name: 'b.jpg',
                mimeType: 'image/jpeg',
              }),
            ),
          copy: jest.fn(),
        },
      });

      const result = await service.createJobs(
        {
          links: [linkOf(FILE_ID), linkOf(FILE_ID_2)],
          mergeImagesIntoOnePost: true,
        },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create.mock.calls[0][0].files).toHaveLength(2);
    });

    it('gộp mà lô CHỈ có video ⇒ 400 nói rõ nên bỏ tick', async () => {
      const { service, repository } = build();

      await expect(
        service.createJobs(
          { links: [linkOf(FILE_ID)], mergeImagesIntoOnePost: true },
          ACTOR,
        ),
      ).rejects.toThrow(/chỉ có video/);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('gộp mà lô TRỘN ảnh + video ⇒ 400: Facebook không trộn trong một bài', async () => {
      const { service, repository } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(
              makeMeta({ name: 'a.jpg', mimeType: 'image/jpeg' }),
            )
            .mockResolvedValueOnce(makeMeta({ fileId: FILE_ID_2 })), // video
          copy: jest.fn(),
        },
      });

      await expect(
        service.createJobs(
          {
            links: [linkOf(FILE_ID), linkOf(FILE_ID_2)],
            mergeImagesIntoOnePost: true,
          },
          ACTOR,
        ),
      ).rejects.toThrow(/không trộn ảnh và video/);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('KHÔNG tick gộp thì lô toàn video vẫn nhập bình thường (mỗi video 1 bài)', async () => {
      const { service } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(makeMeta())
            .mockResolvedValueOnce(makeMeta({ fileId: FILE_ID_2 })),
          copy: jest.fn(),
        },
      });

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID), linkOf(FILE_ID_2)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(2);
    });

    it('luôn lưu caption "-" + forceReview ⇒ bài vào Chờ duyệt kể cả ADMIN', async () => {
      const { service, repository } = build();

      await service.createJobs({ links: [linkOf(FILE_ID)] }, ACTOR);

      expect(repository.create.mock.calls[0][0].metadata).toMatchObject({
        caption: '-',
        forceReview: true,
        category: 'Chưa phân loại',
        assignedPageIds: [],
      });
    });

    it('dòng hỏng KHÔNG làm hỏng cả lô — vẫn nhập dòng tốt, báo lại dòng xấu', async () => {
      const { service, repository } = build();

      const result = await service.createJobs(
        { links: ['ảnh khai trương', linkOf(FILE_ID)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.skipped).toEqual([
        expect.objectContaining({ line: 1, reason: 'LINK_INVALID' }),
      ]);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('bỏ dòng rỗng và không tính vào số thứ tự dòng đã dùng', async () => {
      const { service } = build();

      const result = await service.createJobs(
        { links: ['', '   ', linkOf(FILE_ID)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.skipped).toEqual([]);
    });

    it('link thư mục ⇒ bỏ qua kèm hướng dẫn dán từng file', async () => {
      const { service } = build();

      await expect(
        service.createJobs(
          { links: [`https://drive.google.com/drive/folders/${FILE_ID}`] },
          ACTOR,
        ),
      ).rejects.toThrow(/từng file/);
    });

    it('file private ⇒ câu lỗi nêu ĐÚNG email cần chia sẻ tới (§0.4)', async () => {
      const { service } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockRejectedValue(
              new DriveFileError('NOT_FOUND_OR_NO_ACCESS', 'không đọc được'),
            ),
          copy: jest.fn(),
        },
      });

      const result = await service
        .createJobs({ links: [linkOf(FILE_ID), linkOf(FILE_ID_2)] }, ACTOR)
        .catch((error: Error) => error);

      expect(String((result as Error).message)).toContain(ACCOUNT_EMAIL);
      expect(String((result as Error).message)).toContain(
        'Bất kỳ ai có đường liên kết',
      );
    });

    it('chưa lấy được email tài khoản vẫn chỉ được chỗ xem', async () => {
      const { service } = build({
        settings: {
          getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 500 }),
          getDriveAccountEmail: jest.fn().mockResolvedValue(null),
        },
        storage: {
          getMetadata: jest
            .fn()
            .mockRejectedValue(
              new DriveFileError('NOT_FOUND_OR_NO_ACCESS', 'không đọc được'),
            ),
          copy: jest.fn(),
        },
      });

      await expect(
        service.createJobs({ links: [linkOf(FILE_ID)] }, ACTOR),
      ).rejects.toThrow(/Cài đặt chung/);
    });

    it('chủ file tắt quyền sao chép ⇒ bỏ qua với lý do COPY_DISABLED', async () => {
      const { service } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(makeMeta({ canCopy: false }))
            .mockResolvedValueOnce(makeMeta({ fileId: FILE_ID_2 })),
          copy: jest.fn(),
        },
      });

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID), linkOf(FILE_ID_2)] },
        ACTOR,
      );

      expect(result.skipped[0]).toMatchObject({
        line: 1,
        reason: 'COPY_DISABLED',
      });
      expect(result.jobs).toHaveLength(1);
    });

    it('file không phải ảnh/video ⇒ NOT_MEDIA', async () => {
      const { service } = build({
        storage: {
          getMetadata: jest.fn().mockResolvedValue(
            makeMeta({
              mimeType: 'application/vnd.google-apps.document',
              size: null,
            }),
          ),
          copy: jest.fn(),
        },
      });

      const result = await service
        .createJobs({ links: [linkOf(FILE_ID)] }, ACTOR)
        .catch((error: Error) => error);

      expect(String((result as Error).message)).toContain(
        'không phải ảnh/video',
      );
    });

    it('vượt maxUploadMb ĐỘNG trong Settings ⇒ TOO_LARGE', async () => {
      const { service } = build({
        settings: {
          getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 10 }),
          getDriveAccountEmail: jest.fn().mockResolvedValue(ACCOUNT_EMAIL),
        },
      });

      await expect(
        service.createJobs({ links: [linkOf(FILE_ID)] }, ACTOR),
      ).rejects.toThrow(/10MB/);
    });

    it('Drive chặn tốc độ ⇒ RATE_LIMITED', async () => {
      const { service } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockRejectedValueOnce(
              new DriveFileError('RATE_LIMITED', 'quá nhanh'),
            )
            .mockResolvedValueOnce(makeMeta({ fileId: FILE_ID_2 })),
          copy: jest.fn(),
        },
      });

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID), linkOf(FILE_ID_2)] },
        ACTOR,
      );

      expect(result.skipped[0].reason).toBe('RATE_LIMITED');
    });

    it('link trùng trong cùng lô ⇒ chỉ 1 bài, chỉ 1 lần gọi Drive', async () => {
      const { service, storage } = build();

      const result = await service.createJobs(
        {
          links: [
            linkOf(FILE_ID),
            `https://drive.google.com/open?id=${FILE_ID}`, // cùng file, khác dạng URL
          ],
        },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.skipped[0]).toMatchObject({
        line: 2,
        reason: 'DUPLICATE_IN_LIST',
      });
      expect(storage.getMetadata).toHaveBeenCalledTimes(1);
    });

    it('file đã nhập trước đó ⇒ CẢNH BÁO trong duplicates nhưng vẫn nhập', async () => {
      const { service } = build({
        repository: {
          create: jest
            .fn()
            .mockImplementation((data: Record<string, unknown>) =>
              makeJob(data),
            ),
          update: jest.fn().mockResolvedValue(makeJob()),
          findImportedSourceFiles: jest.fn().mockResolvedValue([
            {
              sourceDriveFileId: FILE_ID,
              contentAssetId: 'content-cu',
              title: 'Bài cũ',
            },
          ]),
        },
      });

      const result = await service.createJobs(
        { links: [linkOf(FILE_ID)] },
        ACTOR,
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.duplicates).toEqual([
        expect.objectContaining({ line: 1, title: 'Bài cũ' }),
      ]);
    });

    it('shortcut được resolve sang file đích, không báo lỗi', async () => {
      const { service, repository } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(
              makeMeta({
                mimeType: 'application/vnd.google-apps.shortcut',
                shortcutTargetId: FILE_ID_2,
                size: null,
              }),
            )
            .mockResolvedValueOnce(
              makeMeta({
                fileId: FILE_ID_2,
                name: 'anh-that.jpg',
                mimeType: 'image/jpeg',
              }),
            ),
          copy: jest.fn(),
        },
      });

      await service.createJobs({ links: [linkOf(FILE_ID)] }, ACTOR);

      expect(repository.create.mock.calls[0][0].files[0].sourceFileId).toBe(
        FILE_ID_2,
      );
    });

    it('danh sách rỗng ⇒ 400', async () => {
      const { service } = build();

      await expect(
        service.createJobs({ links: [] }, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('vượt trần số link ⇒ 400 trước khi gọi Drive', async () => {
      const { service, storage } = build();
      const links = Array.from({ length: 51 }, () => linkOf(FILE_ID));

      await expect(service.createJobs({ links }, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.getMetadata).not.toHaveBeenCalled();
    });
  });

  describe('inspectLinks — dò trước để UI khoá checkbox "gộp ảnh"', () => {
    it('trả mediaType từng dòng và KHÔNG tạo job nào', async () => {
      const { service, repository, queue } = build({
        storage: {
          getMetadata: jest
            .fn()
            .mockResolvedValueOnce(
              makeMeta({ name: 'a.jpg', mimeType: 'image/jpeg' }),
            )
            .mockResolvedValueOnce(makeMeta({ fileId: FILE_ID_2 })), // video
          copy: jest.fn(),
        },
      });

      const result = await service.inspectLinks({
        links: [linkOf(FILE_ID), linkOf(FILE_ID_2)],
      });

      expect(result.items).toEqual([
        expect.objectContaining({
          line: 1,
          ok: true,
          mediaType: MediaType.image,
        }),
        expect.objectContaining({
          line: 2,
          ok: true,
          mediaType: MediaType.video,
        }),
      ]);
      expect(repository.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('danh sách rỗng ⇒ trả rỗng, không gọi Drive (người dùng đang gõ dở)', async () => {
      const { service, storage } = build();

      const result = await service.inspectLinks({ links: ['', '   '] });

      expect(result.items).toEqual([]);
      expect(storage.getMetadata).not.toHaveBeenCalled();
    });

    it('dòng hỏng ⇒ mediaType null kèm lý do, không ném lỗi cả lô', async () => {
      const { service } = build();

      const result = await service.inspectLinks({
        links: ['ảnh khai trương', linkOf(FILE_ID)],
      });

      expect(result.items[0]).toMatchObject({
        ok: false,
        mediaType: null,
        reason: 'LINK_INVALID',
      });
      expect(result.items[1].ok).toBe(true);
    });

    it('vượt trần số link ⇒ 400 trước khi gọi Drive', async () => {
      const { service, storage } = build();

      await expect(
        service.inspectLinks({
          links: Array.from({ length: 51 }, () => linkOf(FILE_ID)),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.getMetadata).not.toHaveBeenCalled();
    });
  });

  describe('processImport', () => {
    /** Chạy `runJob` thật sự bằng cách gọi lại callback mà service truyền vào. */
    const runWork = async (
      mocks: { service: DriveImportsService } & Mocks,
      job: MediaUploadJobRecord,
    ): Promise<string> => {
      await mocks.service.processImport({
        mediaUploadJobId: job.id,
        attemptNo: 1,
        isLastAttempt: false,
      });
      const work = mocks.jobsService.runJob.mock.calls[0][3];
      return work(job);
    };

    it('chạy qua khung runJob với đúng nguồn và trạng thái COPYING_FROM_DRIVE', async () => {
      const mocks = build();

      await mocks.service.processImport({
        mediaUploadJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(mocks.jobsService.runJob).toHaveBeenCalledWith(
        expect.objectContaining({ mediaUploadJobId: 'job-1' }),
        MediaUploadSource.DRIVE_LINK,
        MediaUploadStatus.COPYING_FROM_DRIVE,
        expect.any(Function),
      );
    });

    it('copy phía Drive rồi tạo bài — KHÔNG tải file về server', async () => {
      const mocks = build();

      const contentId = await runWork(mocks, makeJob());

      expect(contentId).toBe('content-1');
      expect(mocks.storage.copy).toHaveBeenCalledWith(
        FILE_ID,
        'clip-khai-truong.mp4',
      );
      // Ràng buộc cốt lõi plan 24 §0.1: không có đường tải nội dung về backend.
      expect(
        (mocks.storage as unknown as Record<string, unknown>).createReadStream,
      ).toBeUndefined();
    });

    it('bài tạo ra mang fileId bản COPY, còn fileId gốc chỉ để chống nhập trùng', async () => {
      const mocks = build();

      await runWork(mocks, makeJob());

      expect(mocks.contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driveFileId: 'copy-1',
          sourceDriveFileId: FILE_ID,
          mediaType: MediaType.video,
        }),
        expect.objectContaining({ id: ACTOR.id, role: 'ADMIN' }),
      );
    });

    it('bài nhiều ảnh: ảnh đầu là bài chính, phần còn lại vào extraFiles', async () => {
      const mocks = build();
      mocks.storage.copy
        .mockResolvedValueOnce({
          fileId: 'copy-1',
          name: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 10,
          webViewLink: null,
          thumbnailLink: null,
        })
        .mockResolvedValueOnce({
          fileId: 'copy-2',
          name: 'b.jpg',
          mimeType: 'image/jpeg',
          size: 20,
          webViewLink: null,
          thumbnailLink: null,
        });

      await runWork(
        mocks,
        makeJob({
          files: [
            {
              originalFilename: 'a.jpg',
              mimeType: 'image/jpeg',
              size: 10,
              sourceFileId: FILE_ID,
            },
            {
              originalFilename: 'b.jpg',
              mimeType: 'image/jpeg',
              size: 20,
              sourceFileId: FILE_ID_2,
            },
          ],
        }),
      );

      expect(mocks.contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driveFileId: 'copy-1',
          extraFiles: [expect.objectContaining({ driveFileId: 'copy-2' })],
        }),
        expect.anything(),
      );
    });

    it('forceReview của job được chuyển tiếp xuống ContentAssetsService', async () => {
      const mocks = build();

      await runWork(
        mocks,
        makeJob({
          metadata: {
            title: 'Không caption',
            category: 'Review',
            caption: '-',
            assignedPageIds: [],
            forceReview: true,
          },
        }),
      );

      expect(mocks.contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({ forceReview: true }),
        expect.anything(),
      );
    });

    it('copyToDrive = false ⇒ KHÔNG copy, bài trỏ thẳng vào fileId gốc', async () => {
      const mocks = build();

      const contentId = await runWork(
        mocks,
        makeJob({
          files: [
            {
              originalFilename: 'clip-khai-truong.mp4',
              mimeType: 'video/mp4',
              size: 50 * MB,
              sourceFileId: FILE_ID,
              sourceWebViewLink: 'https://drive.google.com/file/d/goc-1/view',
              sourceThumbnailLink: 'https://drive/goc-1/thumb',
            },
          ],
          metadata: {
            title: 'clip-khai-truong',
            category: 'Review',
            caption: 'Caption đăng bài',
            assignedPageIds: [],
            copyToDrive: false,
          },
        }),
      );

      expect(contentId).toBe('content-1');
      expect(mocks.storage.copy).not.toHaveBeenCalled();
      expect(mocks.contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // driveFileId == sourceDriveFileId chính là dấu hiệu "file của người
          // khác" — chỗ xoá bài dựa vào đó để không xoá file gốc.
          driveFileId: FILE_ID,
          sourceDriveFileId: FILE_ID,
          driveUrl: 'https://drive.google.com/file/d/goc-1/view',
          thumbnailUrl: 'https://drive/goc-1/thumb',
          fileSize: 50 * MB,
        }),
        expect.anything(),
      );
    });

    it('chỉ lưu link mà thiếu webViewLink ⇒ tự dựng link từ fileId', async () => {
      const mocks = build();

      await runWork(
        mocks,
        makeJob({
          files: [
            {
              originalFilename: 'a.jpg',
              mimeType: 'image/jpeg',
              size: 10,
              sourceFileId: FILE_ID,
            },
          ],
          metadata: {
            title: 'a',
            category: 'Review',
            caption: '-',
            assignedPageIds: [],
            copyToDrive: false,
          },
        }),
      );

      expect(mocks.contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driveUrl: `https://drive.google.com/file/d/${FILE_ID}/view`,
          thumbnailUrl: undefined,
        }),
        expect.anything(),
      );
    });

    it('job thiếu sourceFileId ⇒ ném lỗi rõ ràng, không copy nhầm', async () => {
      const mocks = build();

      await expect(
        runWork(
          mocks,
          makeJob({
            files: [
              { originalFilename: 'a.jpg', mimeType: 'image/jpeg', size: 10 },
            ],
          }),
        ),
      ).rejects.toThrow(/thiếu fileId nguồn/);
      expect(mocks.storage.copy).not.toHaveBeenCalled();
    });
  });
});
