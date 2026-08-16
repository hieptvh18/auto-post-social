import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { SettingsService } from '../../settings/settings.service';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import { ReupCleanupService } from '../reup-cleanup.service';
import type { ReupCleanupRepository } from '../reup-cleanup.repository';
import type { ReupVideosRepository } from '../reup-videos.repository';

const makeCandidate = (overrides = {}) => ({
  id: 'content-1',
  title: 'Video A',
  driveFileId: 'drive-1',
  fileSize: 1000n,
  publishedAt: new Date('2026-08-01T00:00:00Z'),
  ...overrides,
});

describe('ReupCleanupService', () => {
  let repository: {
    findCandidates: jest.Mock;
    markResourceDeleted: jest.Mock;
    findOneEligible: jest.Mock;
  };
  let videos: { findById: jest.Mock };
  let settings: {
    getReupCleanupConfig: jest.Mock;
  };
  let driveFactory: { get: jest.Mock };
  let storage: { deleteIfExists: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: ReupCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      findCandidates: jest.fn().mockResolvedValue([]),
      markResourceDeleted: jest.fn().mockResolvedValue(undefined),
      findOneEligible: jest.fn().mockResolvedValue(null),
    };
    videos = { findById: jest.fn().mockResolvedValue(null) };
    settings = {
      getReupCleanupConfig: jest
        .fn()
        .mockResolvedValue({ enabled: true, retentionDays: 7 }),
    };
    storage = { deleteIfExists: jest.fn().mockResolvedValue(undefined) };
    driveFactory = { get: jest.fn().mockResolvedValue(storage) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ReupCleanupService(
      repository as unknown as ReupCleanupRepository,
      videos as unknown as ReupVideosRepository,
      settings as unknown as SettingsService,
      driveFactory as unknown as DriveStorageFactory,
      auditService as unknown as AuditService,
    );
  });

  describe('preview', () => {
    it('trả về danh sách + tổng dung lượng theo config hiện tại', async () => {
      repository.findCandidates.mockResolvedValue([
        makeCandidate({ fileSize: 1000n }),
        makeCandidate({ id: 'content-2', fileSize: 2000n }),
      ]);

      const result = await service.preview();

      expect(repository.findCandidates).toHaveBeenCalledWith(7);
      expect(result.items).toHaveLength(2);
      expect(result.totalBytes).toBe(3000);
      expect(result.enabled).toBe(true);
      expect(result.retentionDays).toBe(7);
    });

    it('fileSize null tính là 0 khi cộng tổng', async () => {
      repository.findCandidates.mockResolvedValue([
        makeCandidate({ fileSize: null }),
      ]);

      const result = await service.preview();

      expect(result.totalBytes).toBe(0);
      expect(result.items[0].fileSize).toBeNull();
    });
  });

  describe('run', () => {
    it('enabled = false ⇒ KHÔNG gọi Drive, KHÔNG gọi findCandidates để xoá', async () => {
      settings.getReupCleanupConfig.mockResolvedValue({
        enabled: false,
        retentionDays: 7,
      });

      const result = await service.run(null);

      expect(driveFactory.get).not.toHaveBeenCalled();
      expect(repository.findCandidates).not.toHaveBeenCalled();
      expect(result).toEqual({
        deletedCount: 0,
        freedBytes: 0,
        failedCount: 0,
      });
    });

    it('không có bài nào đủ điều kiện ⇒ không gọi Drive, không ghi audit', async () => {
      repository.findCandidates.mockResolvedValue([]);

      const result = await service.run(null);

      expect(driveFactory.get).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result.deletedCount).toBe(0);
    });

    it('xoá thành công ⇒ markResourceDeleted + cộng dồn freedBytes + 1 dòng audit cho cả lô', async () => {
      repository.findCandidates.mockResolvedValue([
        makeCandidate({
          id: 'content-1',
          driveFileId: 'drive-1',
          fileSize: 1000n,
        }),
        makeCandidate({
          id: 'content-2',
          driveFileId: 'drive-2',
          fileSize: 2000n,
        }),
      ]);

      const result = await service.run(null);

      expect(storage.deleteIfExists).toHaveBeenCalledWith('drive-1');
      expect(storage.deleteIfExists).toHaveBeenCalledWith('drive-2');
      expect(repository.markResourceDeleted).toHaveBeenCalledWith('content-1');
      expect(repository.markResourceDeleted).toHaveBeenCalledWith('content-2');
      expect(result).toEqual({
        deletedCount: 2,
        freedBytes: 3000,
        failedCount: 0,
      });
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          action: AuditAction.REUP_CLEANUP_CRON,
        }),
      );
    });

    it('actorId khác null (bấm tay) ⇒ ghi REUP_CLEANUP_MANUAL', async () => {
      repository.findCandidates.mockResolvedValue([makeCandidate()]);

      await service.run('user-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: AuditAction.REUP_CLEANUP_MANUAL,
        }),
      );
    });

    it('Drive lỗi khác 404 (500) ⇒ KHÔNG set resourceDeletedAt, tính vào failedCount', async () => {
      repository.findCandidates.mockResolvedValue([makeCandidate()]);
      storage.deleteIfExists.mockRejectedValue(new Error('Drive 500'));

      const result = await service.run(null);

      expect(repository.markResourceDeleted).not.toHaveBeenCalled();
      expect(result).toEqual({
        deletedCount: 0,
        freedBytes: 0,
        failedCount: 1,
      });
      // Không có bài nào xoá thành công ⇒ không ghi audit (chỉ ghi khi deletedCount > 0).
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('deleteIfExists tự nuốt 404 ở tầng storage ⇒ vẫn markResourceDeleted', async () => {
      // deleteIfExists coi 404 là thành công NGAY TRONG storage — service chỉ cần
      // gọi bình thường và không phải biết chi tiết 404.
      repository.findCandidates.mockResolvedValue([makeCandidate()]);

      const result = await service.run(null);

      expect(repository.markResourceDeleted).toHaveBeenCalled();
      expect(result.deletedCount).toBe(1);
    });
  });

  describe('deleteOne', () => {
    it('video chưa IMPORTED (contentAssetId null) ⇒ 422', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: null,
      });

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'Video này chưa vào kho',
      );
    });

    it('video không tồn tại ⇒ 404', async () => {
      videos.findById.mockResolvedValue(null);

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'Không tìm thấy video reup',
      );
    });

    it('bài sourceType != REUP ⇒ 422 (luật 1, không có ngoại lệ)', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: 'content-1',
      });
      repository.findOneEligible.mockResolvedValue({
        id: 'content-1',
        sourceType: 'MANUAL',
        status: 'PUBLISHED',
        driveFileId: 'drive-1',
        resourceDeletedAt: null,
        hasPendingJob: false,
      });

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'sourceType = REUP',
      );
      expect(storage.deleteIfExists).not.toHaveBeenCalled();
    });

    it('bài chưa PUBLISHED ⇒ 422', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: 'content-1',
      });
      repository.findOneEligible.mockResolvedValue({
        id: 'content-1',
        sourceType: 'REUP',
        status: 'APPROVED',
        driveFileId: 'drive-1',
        resourceDeletedAt: null,
        hasPendingJob: false,
      });

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'PUBLISHED',
      );
    });

    it('đã xoá rồi ⇒ 422', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: 'content-1',
      });
      repository.findOneEligible.mockResolvedValue({
        id: 'content-1',
        sourceType: 'REUP',
        status: 'PUBLISHED',
        driveFileId: 'drive-1',
        resourceDeletedAt: new Date(),
        hasPendingJob: false,
      });

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'đã bị xoá rồi',
      );
    });

    it('còn publish_job treo ở page khác ⇒ 422 (C6)', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: 'content-1',
      });
      repository.findOneEligible.mockResolvedValue({
        id: 'content-1',
        sourceType: 'REUP',
        status: 'PUBLISHED',
        driveFileId: 'drive-1',
        resourceDeletedAt: null,
        hasPendingJob: true,
      });

      await expect(service.deleteOne('video-1', 'user-1')).rejects.toThrow(
        'còn job đăng chưa kết thúc',
      );
    });

    it('đủ điều kiện ⇒ xoá Drive + markResourceDeleted + ghi audit REUP_RESOURCE_DELETE', async () => {
      videos.findById.mockResolvedValue({
        id: 'video-1',
        contentAssetId: 'content-1',
      });
      repository.findOneEligible.mockResolvedValue({
        id: 'content-1',
        sourceType: 'REUP',
        status: 'PUBLISHED',
        driveFileId: 'drive-1',
        resourceDeletedAt: null,
        hasPendingJob: false,
      });

      await service.deleteOne('video-1', 'user-1');

      expect(storage.deleteIfExists).toHaveBeenCalledWith('drive-1');
      expect(repository.markResourceDeleted).toHaveBeenCalledWith('content-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: AuditAction.REUP_RESOURCE_DELETE,
          resource: 'content_asset:content-1',
        }),
      );
    });
  });
});
