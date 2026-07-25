import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ContentActor,
  ContentAssetWithActors,
  ContentAssignment,
} from '../content-assets.repository';
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

const actor = (id: string): ContentActor => ({
  id,
  name: `Người ${id}`,
  email: `${id}@company.local`,
});

const makeAsset = (
  overrides: Partial<ContentAssetWithActors> = {},
): ContentAssetWithActors => ({
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
  updatedById: 'content-1',
  createdBy: actor('content-1'),
  updatedBy: actor('content-1'),
  assignments: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeAssignment = (
  overrides: Partial<ContentAssignment> = {},
): ContentAssignment => ({
  id: 'assign-1',
  facebookPageId: 'page-1',
  publishedAt: null,
  facebookPostId: null,
  facebookPage: { id: 'page-1', pageName: 'Luca Clinic' },
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
    findExistingPageIds: jest.Mock;
    findAllHashtagStrings: jest.Mock;
    findCategoryCounts: jest.Mock;
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
      // Mặc định: mọi page id hỏi tới đều tồn tại.
      findExistingPageIds: jest.fn((ids: string[]) => Promise.resolve(ids)),
      findAllHashtagStrings: jest.fn().mockResolvedValue([]),
      findCategoryCounts: jest.fn().mockResolvedValue([]),
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

    it('gán luôn updatedById = người upload để UI không trống cột người sửa', async () => {
      repository.create.mockResolvedValue(makeAsset());

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
        expect.objectContaining({ updatedById: 'content-1' }),
      );
    });

    it('trả về người upload kèm tên/email, không trả field user nào khác', async () => {
      repository.create.mockResolvedValue(makeAsset());

      const result = await service.create(
        {
          title: 'Bài viết A',
          category: 'Kiến thức',
          caption: 'caption',
          mediaType: MediaType.image,
          driveFileId: 'drive-1',
        },
        contentUser,
      );

      expect(Object.keys(result.createdBy).sort()).toEqual([
        'email',
        'id',
        'name',
      ]);
      expect(result.createdBy.name).toBe('Người content-1');
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

    it('ghi updatedById = actor để tracking người sửa gần nhất', async () => {
      const current = makeAsset({ createdById: 'content-1' });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue({
        ...current,
        title: 'Mới',
        updatedById: 'editor-1',
        updatedBy: actor('editor-1'),
      });

      const result = await service.update(
        'asset-1',
        { title: 'Mới' },
        editorUser,
      );

      expect(repository.update).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ updatedById: 'editor-1' }),
        undefined,
      );
      expect(result.updatedBy?.id).toBe('editor-1');
    });

    it('trả updatedBy = null với bài cũ chưa có người sửa', async () => {
      const current = makeAsset({ updatedById: null, updatedBy: null });
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue(current);

      const result = await service.update(
        'asset-1',
        { title: 'Mới' },
        editorUser,
      );

      expect(result.updatedBy).toBeNull();
    });
  });

  /** Cho repository.update trả về đúng những gì service ghi xuống. */
  const echoUpdate = (current: ContentAssetWithActors): void => {
    repository.findById.mockResolvedValue(current);
    repository.update.mockImplementation(
      (_id: string, data: Partial<ContentAssetWithActors>) =>
        Promise.resolve({ ...current, ...data }),
    );
  };

  describe('update — duyệt bài (status / isAds)', () => {
    it('ném ForbiddenException khi CONTENT tự đổi trạng thái duyệt', async () => {
      echoUpdate(makeAsset());

      await expect(
        service.update('asset-1', { status: 'APPROVED' }, contentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('ném ForbiddenException khi CONTENT tự tick Đạt ADS', async () => {
      echoUpdate(makeAsset());

      await expect(
        service.update('asset-1', { isAds: true }, contentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('EDITOR duyệt bài ⇒ ghi approvedById và xoá lý do cũ', async () => {
      echoUpdate(
        makeAsset({
          status: ContentStatus.REJECTED,
          rejectComment: 'Ảnh mờ',
        }),
      );

      const result = await service.update(
        'asset-1',
        { status: 'APPROVED' },
        editorUser,
      );

      expect(result.status).toBe(ContentStatus.APPROVED);
      expect(result.approvedById).toBe('editor-1');
      expect(result.rejectComment).toBeNull();
    });

    it('ném BadRequestException khi từ chối mà không có lý do', async () => {
      echoUpdate(makeAsset({ status: ContentStatus.PENDING_REVIEW }));

      await expect(
        service.update('asset-1', { status: 'REJECTED' }, editorUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('từ chối kèm lý do ⇒ lưu lý do, bỏ phê duyệt cũ', async () => {
      echoUpdate(
        makeAsset({
          status: ContentStatus.APPROVED,
          approvedById: 'editor-9',
        }),
      );

      const result = await service.update(
        'asset-1',
        { status: 'REJECTED', rejectComment: 'Sai thông điệp' },
        editorUser,
      );

      expect(result.status).toBe(ContentStatus.REJECTED);
      expect(result.rejectComment).toBe('Sai thông điệp');
      expect(result.approvedById).toBeNull();
    });

    it('rút phê duyệt về chờ duyệt ⇒ xoá approvedById', async () => {
      echoUpdate(
        makeAsset({
          status: ContentStatus.APPROVED,
          approvedById: 'editor-1',
        }),
      );

      const result = await service.update(
        'asset-1',
        { status: 'PENDING_REVIEW' },
        editorUser,
      );

      expect(result.status).toBe(ContentStatus.PENDING_REVIEW);
      expect(result.approvedById).toBeNull();
    });

    it.each(['PUBLISHING', 'PUBLISHED'] as const)(
      'ném 422 khi client tự set %s (chỉ Bot được set)',
      async (status) => {
        echoUpdate(makeAsset({ status: ContentStatus.APPROVED }));

        await expect(
          service.update('asset-1', { status }, editorUser),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('ném 422 khi đổi trạng thái duyệt của bài đã đăng', async () => {
      echoUpdate(makeAsset({ status: ContentStatus.PUBLISHED }));

      await expect(
        service.update('asset-1', { status: 'PENDING_REVIEW' }, editorUser),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('gửi lại đúng trạng thái hiện tại ⇒ không đụng approvedById', async () => {
      echoUpdate(
        makeAsset({ status: ContentStatus.APPROVED, approvedById: 'editor-9' }),
      );

      const result = await service.update(
        'asset-1',
        { status: 'APPROVED' },
        editorUser,
      );

      expect(result.approvedById).toBe('editor-9');
    });

    it('CONTENT sửa nội dung bài bị từ chối ⇒ tự quay lại chờ duyệt', async () => {
      echoUpdate(
        makeAsset({
          createdById: 'content-1',
          status: ContentStatus.REJECTED,
          rejectComment: 'Ảnh mờ',
        }),
      );

      const result = await service.update(
        'asset-1',
        { caption: 'Caption sửa lại' },
        contentUser,
      );

      expect(result.status).toBe(ContentStatus.PENDING_REVIEW);
      expect(result.rejectComment).toBeNull();
    });

    it('EDITOR sửa nội dung bài bị từ chối ⇒ giữ nguyên trạng thái', async () => {
      echoUpdate(
        makeAsset({
          status: ContentStatus.REJECTED,
          rejectComment: 'Ảnh mờ',
        }),
      );

      const result = await service.update(
        'asset-1',
        { caption: 'Caption sửa lại' },
        editorUser,
      );

      expect(result.status).toBe(ContentStatus.REJECTED);
    });

    it('ghi audit CONTENT_STATUS_CHANGE và CONTENT_ADS_MARK khi có đổi', async () => {
      echoUpdate(makeAsset({ status: ContentStatus.PENDING_REVIEW }));

      await service.update(
        'asset-1',
        { status: 'APPROVED', isAds: true },
        editorUser,
      );

      const actions = auditService.log.mock.calls.map(
        (call: [{ action: string }]) => call[0].action,
      );
      expect(actions).toContain('CONTENT_STATUS_CHANGE');
      expect(actions).toContain('CONTENT_ADS_MARK');
    });
  });

  describe('update — phân bổ page', () => {
    it('không gửi assignedPageIds ⇒ không đụng tới phân bổ hiện có', async () => {
      echoUpdate(makeAsset({ assignments: [makeAssignment()] }));

      await service.update('asset-1', { title: 'Mới' }, editorUser);

      expect(repository.update).toHaveBeenCalledWith(
        'asset-1',
        expect.anything(),
        undefined,
      );
    });

    it('tính đúng diff thêm/bớt page', async () => {
      echoUpdate(
        makeAsset({
          assignments: [
            makeAssignment({ facebookPageId: 'page-1' }),
            makeAssignment({ id: 'assign-2', facebookPageId: 'page-2' }),
          ],
        }),
      );

      await service.update(
        'asset-1',
        { assignedPageIds: ['page-2', 'page-3'] },
        editorUser,
      );

      expect(repository.update).toHaveBeenCalledWith(
        'asset-1',
        expect.anything(),
        { addPageIds: ['page-3'], removePageIds: ['page-1'] },
      );
    });

    it('ném ConflictException khi gỡ page đã đăng bài', async () => {
      echoUpdate(
        makeAsset({
          assignments: [
            makeAssignment({ publishedAt: new Date('2026-02-02') }),
          ],
        }),
      );

      await expect(
        service.update('asset-1', { assignedPageIds: [] }, editorUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException khi gán vào page không tồn tại', async () => {
      echoUpdate(makeAsset());
      repository.findExistingPageIds.mockResolvedValue([]);

      await expect(
        service.update(
          'asset-1',
          { assignedPageIds: ['page-die'] },
          editorUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('đổi lỗi unique P2002 thành ConflictException', async () => {
      repository.findById.mockResolvedValue(makeAsset());
      repository.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update('asset-1', { assignedPageIds: ['page-1'] }, editorUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findHashtagSuggestions', () => {
    it('gộp hashtag không phân biệt hoa/thường và đếm theo số bài', async () => {
      repository.findAllHashtagStrings.mockResolvedValue([
        '#cxk #phucan',
        '#CXK, #tuthe',
        '#cxk #cxk',
      ]);

      const result = await service.findHashtagSuggestions();

      expect(result[0]).toEqual({ tag: '#cxk', count: 3 });
      expect(result.map((s) => s.tag)).toEqual(['#cxk', '#phucan', '#tuthe']);
    });

    it('thêm dấu # cho token người dùng gõ thiếu', async () => {
      repository.findAllHashtagStrings.mockResolvedValue(['cxk']);

      const result = await service.findHashtagSuggestions();

      expect(result).toEqual([{ tag: '#cxk', count: 1 }]);
    });
  });

  describe('findCategorySuggestions', () => {
    it('gộp danh mục chỉ khác hoa/thường hoặc khoảng trắng thừa, xếp theo số bài', async () => {
      repository.findCategoryCounts.mockResolvedValue([
        { category: 'Thăm khám', count: 2 },
        { category: ' thăm khám ', count: 3 },
        { category: 'Khuyến mãi', count: 4 },
        { category: '   ', count: 9 },
      ]);

      const result = await service.findCategorySuggestions();

      expect(result).toEqual([
        { category: 'Thăm khám', count: 5 },
        { category: 'Khuyến mãi', count: 4 },
      ]);
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

    it('ném ConflictException khi bài đã đăng trên ít nhất 1 page', async () => {
      repository.findById.mockResolvedValue(
        makeAsset({
          assignments: [
            makeAssignment({ publishedAt: new Date('2026-02-02') }),
          ],
        }),
      );

      await expect(
        service.remove('asset-1', editorUser),
      ).rejects.toBeInstanceOf(ConflictException);
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
