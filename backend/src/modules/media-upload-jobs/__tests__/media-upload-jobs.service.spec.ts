import { readFile, rm } from 'node:fs/promises';
import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  MediaUploadSource,
  MediaUploadStatus,
  UserRole,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AppConfigService } from '../../../config/app-config.service';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type { DriveStorage } from '../../../infra/drive/drive-storage.interface';
import type { ContentAssetsService } from '../../content-assets/content-assets.service';
import type { SettingsService } from '../../settings/settings.service';
import type { CreateMediaUploadJobDto } from '../dto/create-media-upload-job.dto';
import type { MediaUploadJobData } from '../media-upload.constants';
import type {
  MediaUploadJobRecord,
  MediaUploadJobsRepository,
} from '../media-upload-jobs.repository';
import {
  MediaUploadJobsService,
  type UploadedDiskFile,
} from '../media-upload-jobs.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('file-bytes')),
  rm: jest.fn().mockResolvedValue(undefined),
}));

const readFileMock = readFile as jest.MockedFunction<typeof readFile>;
const rmMock = rm as jest.MockedFunction<typeof rm>;

const NOW = new Date('2026-08-07T03:00:00Z');

const ACTOR: AuthenticatedUser = {
  id: 'user-1',
  email: 'content@example.com',
  name: 'Nguyễn Content',
  role: UserRole.CONTENT,
};

const ADMIN: AuthenticatedUser = {
  id: 'user-admin',
  email: 'admin@example.com',
  name: 'System Admin',
  role: UserRole.ADMIN,
};

const DTO: CreateMediaUploadJobDto = {
  title: 'Ảnh khai trương',
  category: 'Review',
  caption: 'Caption đăng bài',
  hashtags: '#tag',
  assignedPageIds: ['page-1'],
};

const makeFile = (
  overrides: Partial<UploadedDiskFile> = {},
): UploadedDiskFile => ({
  originalname: 'anh-1.jpg',
  mimetype: 'image/jpeg',
  size: 1024,
  path: '/tmp/upload/abc.jpg',
  ...overrides,
});

const makeJob = (
  overrides: Partial<MediaUploadJobRecord> = {},
): MediaUploadJobRecord => ({
  id: 'job-1',
  status: MediaUploadStatus.QUEUED,
  source: MediaUploadSource.LOCAL_FILE,
  originalFilename: 'anh-1.jpg',
  fileCount: 1,
  totalSize: 1024n,
  files: [
    {
      originalFilename: 'anh-1.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      tempPath: '/tmp/upload/abc.jpg',
    },
  ],
  metadata: {
    title: 'Ảnh khai trương',
    category: 'Review',
    caption: 'Caption đăng bài',
    hashtags: '#tag',
    assignedPageIds: ['page-1'],
  },
  errorMessage: null,
  attemptCount: 0,
  bullJobId: 'media-upload-job-1',
  filesRemovedAt: null,
  contentAssetId: null,
  createdById: ACTOR.id,
  createdBy: {
    id: ACTOR.id,
    name: ACTOR.name,
    email: ACTOR.email,
    role: 'CONTENT',
  },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/**
 * Mock theo kiểu object literal `jest.Mocked<Pick<...>>` (đúng khuôn các spec
 * sẵn có): giữ được type của từng method mà không kéo cả class vào, nên assert
 * `expect(repository.update)` không dính `unbound-method`.
 */
interface Mocks {
  repository: jest.Mocked<
    Pick<
      MediaUploadJobsRepository,
      | 'countPendingLocalFiles'
      | 'create'
      | 'findById'
      | 'findMany'
      | 'update'
      | 'findPending'
      | 'findTerminalBefore'
      | 'deleteMany'
    >
  >;
  contentAssets: jest.Mocked<Pick<ContentAssetsService, 'create'>>;
  storage: jest.Mocked<Pick<DriveStorage, 'upload'>>;
  queue: jest.Mocked<
    Pick<Queue<MediaUploadJobData>, 'add' | 'remove' | 'obliterate'>
  > & { name: string };
  driveImportQueue: jest.Mocked<
    Pick<Queue<MediaUploadJobData>, 'add' | 'remove' | 'obliterate'>
  > & { name: string };
  settings: jest.Mocked<Pick<SettingsService, 'getDriveConfig'>>;
}

const build = (
  overrides: Partial<Mocks> = {},
): { service: MediaUploadJobsService } & Mocks => {
  const repository: Mocks['repository'] = {
    countPendingLocalFiles: jest.fn().mockResolvedValue(0),
    create: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => makeJob(data)),
    findById: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest
      .fn()
      .mockImplementation((id: string, data: Record<string, unknown>) =>
        makeJob({ id, ...data }),
      ),
    findPending: jest.fn().mockResolvedValue([]),
    findTerminalBefore: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(0),
    ...overrides.repository,
  };

  const contentAssets: Mocks['contentAssets'] = {
    create: jest.fn().mockResolvedValue({ id: 'content-1' }),
    ...overrides.contentAssets,
  };

  const storage: Mocks['storage'] = {
    upload: jest.fn().mockResolvedValue({
      fileId: 'drive-1',
      name: 'anh-1.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      webViewLink: 'https://drive/1',
      thumbnailLink: 'https://drive/1/thumb',
    }),
    ...overrides.storage,
  };

  const queue: Mocks['queue'] = {
    name: 'media-upload',
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(1),
    obliterate: jest.fn().mockResolvedValue(undefined),
    ...overrides.queue,
  };

  // Queue thứ hai (plan 24) — service phải biết cả hai để retry đẩy job nhập
  // từ link vào đúng worker.
  const driveImportQueue: Mocks['queue'] = {
    name: 'media-drive-import',
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(1),
    obliterate: jest.fn().mockResolvedValue(undefined),
    ...overrides.driveImportQueue,
  };

  const settings: Mocks['settings'] = {
    getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 500 }),
    ...overrides.settings,
  };

  const service = new MediaUploadJobsService(
    repository as unknown as MediaUploadJobsRepository,
    contentAssets as unknown as ContentAssetsService,
    {
      get: jest.fn().mockResolvedValue(storage),
    } as unknown as DriveStorageFactory,
    settings as unknown as SettingsService,
    {
      mediaUpload: {
        tmpDir: '/tmp/upload',
        concurrency: 3,
        retentionMs: 86_400_000,
        maxPendingJobs: 20,
      },
    } as unknown as AppConfigService,
    { now: () => NOW },
    queue as unknown as Queue<MediaUploadJobData>,
    driveImportQueue as unknown as Queue<MediaUploadJobData>,
  );

  return {
    service,
    repository,
    contentAssets,
    storage,
    queue,
    driveImportQueue,
    settings,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  readFileMock.mockResolvedValue(Buffer.from('file-bytes'));
  rmMock.mockResolvedValue(undefined);
});

describe('MediaUploadJobsService', () => {
  describe('createJob', () => {
    it('tạo job QUEUED và đẩy vào hàng đợi khi file hợp lệ', async () => {
      const { service, repository, queue } = build();

      const result = await service.createJob([makeFile()], DTO, ACTOR);

      expect(result.status).toBe(MediaUploadStatus.QUEUED);
      const metadataMatcher: unknown = expect.objectContaining({
        title: DTO.title,
        assignedPageIds: ['page-1'],
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdById: ACTOR.id,
          metadata: metadataMatcher,
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'media-upload',
        { mediaUploadJobId: 'job-1' },
        expect.objectContaining({ jobId: 'media-upload-job-1', attempts: 3 }),
      );
    });

    it('nhận N ảnh trong MỘT job (bài nhiều ảnh của plan 22)', async () => {
      const { service, repository } = build();

      await service.createJob(
        [makeFile(), makeFile({ originalname: 'anh-2.jpg' })],
        DTO,
        ACTOR,
      );

      const filesMatcher: unknown = expect.arrayContaining([
        expect.objectContaining({ originalFilename: 'anh-1.jpg' }),
        expect.objectContaining({ originalFilename: 'anh-2.jpg' }),
      ]);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ files: filesMatcher }),
      );
    });

    it('ném 400 và KHÔNG tạo job khi file vượt maxUploadMb (đọc động từ Settings)', async () => {
      const { service, repository } = build({
        settings: {
          getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 1 }),
        },
      });

      await expect(
        service.createJob([makeFile({ size: 5 * 1024 * 1024 })], DTO, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('xoá file tạm khi từ chối request — không để rác trên đĩa', async () => {
      const { service } = build({
        settings: {
          getDriveConfig: jest.fn().mockResolvedValue({ maxUploadMb: 1 }),
        },
      });

      await expect(
        service.createJob(
          [makeFile({ size: 5 * 1024 * 1024, path: '/tmp/upload/big.mp4' })],
          DTO,
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rmMock).toHaveBeenCalledWith('/tmp/upload/big.mp4', {
        force: true,
      });
    });

    it('ném 400 khi gửi nhiều file mà có video (Facebook không ghép video)', async () => {
      const { service } = build();

      await expect(
        service.createJob(
          [makeFile({ mimetype: 'video/mp4' }), makeFile()],
          DTO,
          ACTOR,
        ),
      ).rejects.toThrow(/1 file mỗi bài/);
    });

    it('ném 400 khi định dạng không được hỗ trợ', async () => {
      const { service } = build();

      await expect(
        service.createJob(
          [makeFile({ mimetype: 'application/pdf' })],
          DTO,
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ném 400 khi không có file nào', async () => {
      const { service } = build();

      await expect(service.createJob([], DTO, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('process', () => {
    it('QUEUED → UPLOADING_TO_DRIVE → SUCCESS, tạo bài qua ContentAssetsService', async () => {
      const { service, repository, contentAssets, storage } = build();
      repository.findById.mockResolvedValue(makeJob());

      await service.process({
        mediaUploadJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(repository.update).toHaveBeenNthCalledWith(1, 'job-1', {
        status: MediaUploadStatus.UPLOADING_TO_DRIVE,
        attemptCount: 1,
      });
      expect(storage.upload).toHaveBeenCalledTimes(1);
      // Actor = người bấm Upload, không phải Bot.
      expect(contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({ driveFileId: 'drive-1' }),
        expect.objectContaining({ id: ACTOR.id, role: UserRole.CONTENT }),
      );
      expect(repository.update).toHaveBeenLastCalledWith('job-1', {
        status: MediaUploadStatus.SUCCESS,
        contentAssetId: 'content-1',
        errorMessage: null,
        filesRemovedAt: NOW,
      });
    });

    it('bài nhiều ảnh: ảnh đầu là record chính, phần còn lại vào extraFiles', async () => {
      const { service, repository, contentAssets, storage } = build();
      repository.findById.mockResolvedValue(
        makeJob({
          fileCount: 2,
          files: [
            {
              originalFilename: 'anh-1.jpg',
              mimeType: 'image/jpeg',
              size: 1024,
              tempPath: '/tmp/upload/a.jpg',
            },
            {
              originalFilename: 'anh-2.jpg',
              mimeType: 'image/jpeg',
              size: 2048,
              tempPath: '/tmp/upload/b.jpg',
            },
          ],
        }),
      );
      storage.upload
        .mockResolvedValueOnce({
          fileId: 'drive-1',
          name: 'anh-1.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          webViewLink: null,
          thumbnailLink: null,
        })
        .mockResolvedValueOnce({
          fileId: 'drive-2',
          name: 'anh-2.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
          webViewLink: null,
          thumbnailLink: null,
        });

      await service.process({
        mediaUploadJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(contentAssets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driveFileId: 'drive-1',
          extraFiles: [expect.objectContaining({ driveFileId: 'drive-2' })],
        }),
        expect.anything(),
      );
    });

    it('lỗi Drive khi CÒN lượt thử ⇒ về QUEUED và GIỮ file tạm', async () => {
      const { service, repository, storage } = build();
      repository.findById.mockResolvedValue(makeJob());
      storage.upload.mockRejectedValue(new Error('Drive từ chối'));

      await expect(
        service.process({
          mediaUploadJobId: 'job-1',
          attemptNo: 1,
          isLastAttempt: false,
        }),
      ).rejects.toThrow('Drive từ chối');

      expect(repository.update).toHaveBeenLastCalledWith('job-1', {
        status: MediaUploadStatus.QUEUED,
        errorMessage: 'Drive từ chối',
      });
      expect(rmMock).not.toHaveBeenCalled();
    });

    it('lỗi ở lượt CUỐI ⇒ FAILED kèm errorMessage, vẫn giữ file để "Thử lại"', async () => {
      const { service, repository, storage } = build();
      repository.findById.mockResolvedValue(makeJob());
      storage.upload.mockRejectedValue(new Error('Hết quota Drive'));

      await expect(
        service.process({
          mediaUploadJobId: 'job-1',
          attemptNo: 3,
          isLastAttempt: true,
        }),
      ).rejects.toThrow('Hết quota Drive');

      expect(repository.update).toHaveBeenLastCalledWith('job-1', {
        status: MediaUploadStatus.FAILED,
        errorMessage: 'Hết quota Drive',
      });
      expect(rmMock).not.toHaveBeenCalled();
    });

    it('bỏ qua job không còn ở trạng thái QUEUED (đã bị dọn lúc restart)', async () => {
      const { service, repository, storage } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.FAILED }),
      );

      await service.process({
        mediaUploadJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(storage.upload).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('bỏ qua lặng lẽ khi job đã bị xoá khỏi DB', async () => {
      const { service, repository, storage } = build();
      repository.findById.mockResolvedValue(null);

      await service.process({
        mediaUploadJobId: 'job-1',
        attemptNo: 1,
        isLastAttempt: false,
      });

      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('đẩy lại job FAILED bằng bull jobId MỚI (id cũ bị Bull bỏ qua lặng lẽ)', async () => {
      const { service, repository, queue } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.FAILED }),
      );

      await service.retry('job-1', ACTOR);

      expect(repository.update).toHaveBeenCalledWith('job-1', {
        status: MediaUploadStatus.QUEUED,
        errorMessage: null,
      });
      expect(queue.remove).toHaveBeenCalledWith('media-upload-job-1');
      const [, , opts] = queue.add.mock.calls[0];
      expect(opts?.jobId).toMatch(/^media-upload-job-1-retry-\d+$/);
    });

    it('ném 422 khi job chưa thất bại', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.QUEUED }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('ném 422 khi file tạm đã bị dọn — không thể thử lại mà không chọn lại file', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.FAILED, filesRemovedAt: NOW }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toThrow(
        /chọn lại file/,
      );
    });

    it('ném 403 khi thử lại job của người khác', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.FAILED, createdById: 'user-2' }),
      );

      await expect(service.retry('job-1', ACTOR)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('ADMIN thử lại được job của người khác', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        makeJob({ status: MediaUploadStatus.FAILED, createdById: 'user-2' }),
      );

      await expect(service.retry('job-1', ADMIN)).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('CONTENT chỉ thấy job của chính mình dù gửi mine=false', async () => {
      const { service, repository } = build();

      await service.findAll({ mine: false, limit: 50 }, ACTOR);

      expect(repository.findMany).toHaveBeenCalledWith({
        createdById: ACTOR.id,
        status: undefined,
        limit: 50,
      });
    });

    it('ADMIN gửi mine=false thì xem được job của mọi người', async () => {
      const { service, repository } = build();

      await service.findAll({ mine: false, limit: 50 }, ADMIN);

      expect(repository.findMany).toHaveBeenCalledWith({
        createdById: undefined,
        status: undefined,
        limit: 50,
      });
    });

    it('mặc định (không gửi mine) là job của chính mình', async () => {
      const { service, repository } = build();

      await service.findAll({ limit: 50 }, ADMIN);

      expect(repository.findMany).toHaveBeenCalledWith({
        createdById: ADMIN.id,
        status: undefined,
        limit: 50,
      });
    });
  });

  describe('onModuleInit', () => {
    it('đánh FAILED + xoá file tạm cho job còn dở từ phiên trước', async () => {
      const { service, repository, queue } = build();
      repository.findPending.mockResolvedValue([
        makeJob({ status: MediaUploadStatus.UPLOADING_TO_DRIVE }),
      ]);

      await service.onModuleInit();

      expect(queue.obliterate).toHaveBeenCalled();
      expect(rmMock).toHaveBeenCalledWith('/tmp/upload/abc.jpg', {
        force: true,
      });
      expect(repository.update).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          status: MediaUploadStatus.FAILED,
          filesRemovedAt: NOW,
        }),
      );
    });

    it('không đụng hàng đợi khi không có job dở nào', async () => {
      const { service, queue } = build();

      await service.onModuleInit();

      expect(queue.obliterate).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('xoá file tạm rồi xoá dòng của job đã kết thúc quá hạn giữ', async () => {
      const { service, repository } = build();
      repository.findTerminalBefore.mockResolvedValue([
        makeJob({ status: MediaUploadStatus.FAILED }),
      ]);
      repository.deleteMany.mockResolvedValue(1);

      const removed = await service.cleanup(NOW);

      expect(repository.findTerminalBefore).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 86_400_000),
      );
      expect(rmMock).toHaveBeenCalledWith('/tmp/upload/abc.jpg', {
        force: true,
      });
      expect(repository.deleteMany).toHaveBeenCalledWith(['job-1']);
      expect(removed).toBe(1);
    });

    it('không gọi xoá khi chưa có job nào quá hạn', async () => {
      const { service, repository } = build();

      await expect(service.cleanup(NOW)).resolves.toBe(0);
      expect(repository.deleteMany).not.toHaveBeenCalled();
    });
  });
});
