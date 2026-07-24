import { ConflictException, NotFoundException } from '@nestjs/common';
import type { FacebookPage } from '../../../../generated/prisma/client';
import { UserRole } from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UNKNOWN_TOKEN_MASK } from '../../../common/utils/token-mask.util';
import { CryptoService } from '../../../infra/crypto/crypto.service';
import type { CreateAuditLogData } from '../../audit/audit.repository';
import type { AuditService } from '../../audit/audit.service';
import type {
  CreateFacebookPageData,
  UpdateFacebookPageData,
} from '../facebook-pages.repository';
import type { FacebookPagesRepository } from '../facebook-pages.repository';
import { FacebookPagesService } from '../facebook-pages.service';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

const makePage = (overrides: Partial<FacebookPage> = {}): FacebookPage => ({
  id: 'page-1',
  pageName: 'Luca — Hà Nội',
  pageId: '123456789',
  accessTokenEnc: 'unused-in-most-tests',
  tokenExpireAt: null,
  isActive: true,
  autopostEnabled: false,
  createdById: 'admin-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@company.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};

describe('FacebookPagesService', () => {
  let repository: {
    findMany: jest.Mock<Promise<FacebookPage[]>, []>;
    findById: jest.Mock<Promise<FacebookPage | null>, [string]>;
    findByPageId: jest.Mock<Promise<FacebookPage | null>, [string]>;
    create: jest.Mock<Promise<FacebookPage>, [CreateFacebookPageData]>;
    update: jest.Mock<Promise<FacebookPage>, [string, UpdateFacebookPageData]>;
  };
  let auditService: { log: jest.Mock<Promise<void>, [CreateAuditLogData]> };
  let crypto: CryptoService;
  let service: FacebookPagesService;

  beforeEach(() => {
    repository = {
      findMany: jest.fn<Promise<FacebookPage[]>, []>(),
      findById: jest.fn<Promise<FacebookPage | null>, [string]>(),
      findByPageId: jest.fn<Promise<FacebookPage | null>, [string]>(),
      create: jest.fn<Promise<FacebookPage>, [CreateFacebookPageData]>(),
      update: jest.fn<
        Promise<FacebookPage>,
        [string, UpdateFacebookPageData]
      >(),
    };
    auditService = { log: jest.fn<Promise<void>, [CreateAuditLogData]>() };
    crypto = new CryptoService({ tokenEncryptionKey: KEY } as AppConfigService);
    service = new FacebookPagesService(
      repository as unknown as FacebookPagesRepository,
      crypto,
      auditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('mã hoá token trước khi lưu, không lưu plaintext', async () => {
      repository.findByPageId.mockResolvedValue(null);
      const stored = makePage();
      repository.create.mockImplementation((data) =>
        Promise.resolve({ ...stored, accessTokenEnc: data.accessTokenEnc }),
      );

      await service.create(
        {
          pageName: 'Luca',
          pageId: '123456789',
          accessToken: 'EAA-secret-token',
        },
        admin,
      );

      const savedData = repository.create.mock.calls[0][0];
      const savedEnc = savedData.accessTokenEnc;
      expect(savedEnc).not.toContain('EAA-secret-token');
      expect(crypto.decrypt(savedEnc)).toBe('EAA-secret-token');
    });

    it('ném ConflictException khi pageId đã tồn tại', async () => {
      repository.findByPageId.mockResolvedValue(makePage());

      await expect(
        service.create(
          { pageName: 'Luca', pageId: '123456789', accessToken: 'token' },
          admin,
        ),
      ).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('trả về accessTokenMasked đúng 4 ký tự cuối, không lộ token trong response hay audit log', async () => {
      repository.findByPageId.mockResolvedValue(null);
      repository.create.mockResolvedValue(makePage());

      const result = await service.create(
        {
          pageName: 'Luca',
          pageId: '123456789',
          accessToken: 'EAA-secret-9999',
        },
        admin,
      );

      expect(result.accessTokenMasked).toBe('••••9999');
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('accessTokenEnc');

      const auditPayload = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(auditPayload).not.toContain('EAA-secret-9999');
    });
  });

  describe('findAll', () => {
    it('mask đúng token cho từng page trong danh sách', async () => {
      const enc = crypto.encrypt('token-abcd');
      repository.findMany.mockResolvedValue([
        makePage({ accessTokenEnc: enc }),
      ]);

      const result = await service.findAll();

      expect(result[0].accessTokenMasked).toBe('••••abcd');
      expect(result[0]).not.toHaveProperty('accessTokenEnc');
    });

    it('trả mask "chưa xác định" thay vì crash khi token cũ không giải mã được (đổi khoá)', async () => {
      const otherCrypto = new CryptoService({
        tokenEncryptionKey: OTHER_KEY,
      } as AppConfigService);
      const encWithOldKey = otherCrypto.encrypt('token-abcd');
      repository.findMany.mockResolvedValue([
        makePage({ accessTokenEnc: encWithOldKey }),
      ]);

      const result = await service.findAll();

      expect(result[0].accessTokenMasked).toBe(UNKNOWN_TOKEN_MASK);
    });
  });

  describe('update', () => {
    it('đổi token ⇒ mã hoá token mới + ghi thêm audit PAGE_TOKEN_UPDATE', async () => {
      repository.findById.mockResolvedValue(makePage());
      repository.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...makePage(), ...data }),
      );

      await service.update('page-1', { accessToken: 'new-token-1234' }, admin);

      const savedEnc = repository.update.mock.calls[0][1]
        .accessTokenEnc as string;
      expect(crypto.decrypt(savedEnc)).toBe('new-token-1234');
      const actions = auditService.log.mock.calls.map((c) => c[0].action);
      expect(actions).toContain('PAGE_TOKEN_UPDATE');
      expect(actions).toContain('PAGE_UPDATE');
    });

    it('không đổi token ⇒ chỉ ghi audit PAGE_UPDATE, không ghi PAGE_TOKEN_UPDATE', async () => {
      repository.findById.mockResolvedValue(makePage());
      repository.update.mockResolvedValue(makePage({ pageName: 'Tên mới' }));

      await service.update('page-1', { pageName: 'Tên mới' }, admin);

      const actions = auditService.log.mock.calls.map((c) => c[0].action);
      expect(actions).toEqual(['PAGE_UPDATE']);
    });

    it('ném NotFoundException khi page không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', { pageName: 'x' }, admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft delete — set isActive=false thay vì xoá bản ghi', async () => {
      repository.findById.mockResolvedValue(makePage());
      repository.update.mockResolvedValue(makePage({ isActive: false }));

      await service.remove('page-1', admin);

      expect(repository.update).toHaveBeenCalledWith('page-1', {
        isActive: false,
      });
    });
  });

  describe('getDecryptedToken', () => {
    it('trả plaintext token cho page đang active', async () => {
      const enc = crypto.encrypt('plaintext-token');
      repository.findById.mockResolvedValue(makePage({ accessTokenEnc: enc }));

      await expect(service.getDecryptedToken('page-1')).resolves.toBe(
        'plaintext-token',
      );
    });

    it('ném lỗi khi page inactive', async () => {
      repository.findById.mockResolvedValue(makePage({ isActive: false }));

      await expect(service.getDecryptedToken('page-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném NotFoundException khi page không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getDecryptedToken('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
