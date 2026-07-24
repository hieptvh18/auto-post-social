import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ContentAsset } from '../../../../generated/prisma/client';
import {
  ContentStatus,
  MediaType,
  UserRole,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type { AuditService } from '../../audit/audit.service';
import type { ContentAssetsRepository } from '../content-assets.repository';
import { ContentAssetsService } from '../content-assets.service';

const makeAsset = (overrides: Partial<ContentAsset> = {}): ContentAsset => ({
  id: 'asset-1',
  title: 'Bài viết A',
  description: null,
  caption: 'caption',
  hashtags: null,
  category: 'Kiến thức',
  mediaType: MediaType.image,
  driveFileId: 'drive-1',
  driveUrl: null,
  thumbnailUrl: null,
  mimeType: 'image/png',
  fileSize: null,
  status: ContentStatus.PENDING_REVIEW,
  isAds: false,
  rejectComment: null,
  createdById: 'content-1',
  approvedById: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const contentUser: AuthenticatedUser = {
  id: 'content-1',
  email: 'content@company.local',
  name: 'Content User',
  role: UserRole.CONTENT,
};

const otherContentUser: AuthenticatedUser = {
  id: 'content-2',
  email: 'content2@company.local',
  name: 'Content User 2',
  role: UserRole.CONTENT,
};

const editorUser: AuthenticatedUser = {
  id: 'editor-1',
  email: 'editor@company.local',
  name: 'Editor User',
  role: UserRole.EDITOR,
};

describe('ContentAssetsService', () => {
  let repository: {
    findMany: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let driveFactory: { get: jest.Mock };
  let driveStorage: { delete: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: ContentAssetsService;

  beforeEach(() => {
    repository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    driveStorage = { delete: jest.fn().mockResolvedValue(undefined) };
    driveFactory = { get: jest.fn().mockResolvedValue(driveStorage) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ContentAssetsService(
      repository as unknown as ContentAssetsRepository,
      driveFactory as unknown as DriveStorageFactory,
      auditService as unknown as AuditService,
    );
  });

  describe('findAll', () => {
    it('ép createdBy về chính mình khi actor là CONTENT, bỏ qua filter client gửi', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.findAll(
        { page: 1, limit: 20, createdBy: 'someone-else' },
        contentUser,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'content-1' }),
      );
    });

    it('giữ nguyên filter createdBy khi actor là EDITOR', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.findAll(
        { page: 1, limit: 20, createdBy: 'content-2' },
        editorUser,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'content-2' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tìm thấy content', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findOne('missing', editorUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném ForbiddenException khi CONTENT xem bài của người khác', async () => {
      repository.findById.mockResolvedValue(
        makeAsset({ createdById: 'content-1' }),
      );

      await expect(
        service.findOne('asset-1', otherContentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('CONTENT xem được bài của chính mình', async () => {
      const asset = makeAsset({ createdById: 'content-1' });
      repository.findById.mockResolvedValue(asset);

      const result = await service.findOne('asset-1', contentUser);

      expect(result.id).toBe('asset-1');
    });
  });

  describe('create', () => {
    it('tạo content gán createdById theo actor và ghi audit CONTENT_UPLOAD', async () => {
      const created = makeAsset();
      repository.create.mockResolvedValue(created);

      await service.create(
        {
          title: 'Bài viết A',
          category: 'Kiến thức',
          caption: 'caption',
          mediaType: MediaType.image,
          driveFileId: 'drive-1',
        },
        contentUser,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: 'content-1' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONTENT_UPLOAD' }),
      );
    });
  });

  describe('update', () => {
    it('ném ForbiddenException khi CONTENT sửa bài của người khác', async () => {
      repository.findById.mockResolvedValue(
        makeAsset({ createdById: 'content-1' }),
      );

      await expect(
        service.update('asset-1', { title: 'Mới' }, otherContentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('CONTENT sửa được bài của chính mình', async () => {
      const current = makeAsset({ createdById: 'content-1' });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue({ ...current, title: 'Mới' });

      const result = await service.update(
        'asset-1',
        { title: 'Mới' },
        contentUser,
      );

      expect(result.title).toBe('Mới');
    });

    it('EDITOR sửa được bài của người khác', async () => {
      const current = makeAsset({ createdById: 'content-1' });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue({ ...current, title: 'Mới' });

      const result = await service.update(
        'asset-1',
        { title: 'Mới' },
        editorUser,
      );

      expect(result.title).toBe('Mới');
    });
  });

  describe('remove', () => {
    it('ném ForbiddenException khi CONTENT xoá bài của người khác, không đụng Drive/DB', async () => {
      repository.findById.mockResolvedValue(
        makeAsset({ createdById: 'content-1' }),
      );

      await expect(
        service.remove('asset-1', otherContentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(driveStorage.delete).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('xoá file trên Drive rồi mới xoá bản ghi DB, ghi audit CONTENT_DELETE', async () => {
      const current = makeAsset({
        createdById: 'content-1',
        driveFileId: 'drive-9',
      });
      repository.findById.mockResolvedValue(current);

      await service.remove('asset-1', contentUser);

      expect(driveStorage.delete).toHaveBeenCalledWith('drive-9');
      expect(repository.delete).toHaveBeenCalledWith('asset-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONTENT_DELETE' }),
      );
    });
  });
});
