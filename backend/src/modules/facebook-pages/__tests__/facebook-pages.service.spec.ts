import { ConflictException, NotFoundException } from '@nestjs/common';
import type { FacebookPage } from '../../../../generated/prisma/client';
import {
  FacebookConnectMode,
  UserRole,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UNKNOWN_TOKEN_MASK } from '../../../common/utils/token-mask.util';
import { CryptoService } from '../../../infra/crypto/crypto.service';
import type { FacebookGraphClient } from '../../../infra/facebook/facebook-graph.client';
import type {
  FacebookAccountPage,
  FacebookPageProbe,
  FacebookTokenInfo,
} from '../../../infra/facebook/facebook-graph.interface';
import { FacebookGraphError } from '../../../infra/facebook/facebook.errors';
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
  deletedAt: null,
  connectMode: FacebookConnectMode.MANUAL_TOKEN,
  connectionId: null,
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
  let graph: {
    getPage: jest.Mock<Promise<FacebookPageProbe>, [string, string]>;
    debugToken: jest.Mock<Promise<FacebookTokenInfo>, [string]>;
    listPages: jest.Mock<Promise<FacebookAccountPage[]>, [string]>;
  };
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
    graph = {
      getPage: jest.fn<Promise<FacebookPageProbe>, [string, string]>(),
      debugToken: jest.fn<Promise<FacebookTokenInfo>, [string]>(),
      listPages: jest.fn<Promise<FacebookAccountPage[]>, [string]>(),
    };
    crypto = new CryptoService({ tokenEncryptionKey: KEY } as AppConfigService);
    service = new FacebookPagesService(
      repository as unknown as FacebookPagesRepository,
      crypto,
      auditService as unknown as AuditService,
      graph as unknown as FacebookGraphClient,
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

    it('hồi sinh bản ghi cũ khi pageId đã bị xoá mềm, không ném 409 và không tạo dòng mới', async () => {
      repository.findByPageId.mockResolvedValue(
        makePage({ isActive: false, deletedAt: new Date('2026-07-20') }),
      );
      repository.update.mockImplementation((id, data) =>
        Promise.resolve({ ...makePage(), ...data, id }),
      );

      const result = await service.create(
        {
          pageName: 'Luca mới',
          pageId: '123456789',
          accessToken: 'token-8888',
        },
        admin,
      );

      expect(repository.create).not.toHaveBeenCalled();
      const [id, data] = repository.update.mock.calls[0];
      expect(id).toBe('page-1');
      expect(data.deletedAt).toBeNull();
      expect(data.isActive).toBe(true);
      expect(data.pageName).toBe('Luca mới');
      expect(result.accessTokenMasked).toBe('••••8888');
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
    it('soft delete — đánh dấu deletedAt (không chỉ isActive) để page biến khỏi danh sách', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00Z'));
      repository.findById.mockResolvedValue(makePage());
      repository.update.mockResolvedValue(
        makePage({ isActive: false, deletedAt: new Date() }),
      );

      await service.remove('page-1', admin);

      expect(repository.update).toHaveBeenCalledWith('page-1', {
        deletedAt: new Date('2026-07-25T10:00:00Z'),
        isActive: false,
        autopostEnabled: false,
      });
      jest.useRealTimers();
    });

    it('ném NotFoundException khi page không tồn tại (hoặc đã bị xoá trước đó)', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('missing', admin)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
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

  describe('testConnection', () => {
    const probe = (
      overrides: Partial<FacebookPageProbe> = {},
    ): FacebookPageProbe => ({
      id: '123456789',
      name: 'Luca — Hà Nội',
      category: 'Shopping & Retail',
      ...overrides,
    });

    const tokenInfo = (
      overrides: Partial<FacebookTokenInfo> = {},
    ): FacebookTokenInfo => ({
      type: 'PAGE',
      isValid: true,
      profileId: '123456789',
      scopes: [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
      ],
      expiresAt: null,
      ...overrides,
    });

    it('ok khi là Page token đúng page và có scope pages_manage_posts', async () => {
      graph.debugToken.mockResolvedValue(tokenInfo());
      graph.getPage.mockResolvedValue(probe());

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(true);
      expect(result.canPost).toBe(true);
      expect(result.pageName).toBe('Luca — Hà Nội');
      expect(graph.getPage).toHaveBeenCalledWith('123456789', 'tok');
    });

    it('token vĩnh viễn (System User) được nói rõ trong message', async () => {
      graph.debugToken.mockResolvedValue(tokenInfo({ expiresAt: null }));
      graph.getPage.mockResolvedValue(probe());

      const result = await service.testConnection('123456789', 'tok');

      expect(result.expiresAt).toBeNull();
      expect(result.message).toContain('không có hạn dùng');
    });

    it('cảnh báo khi token sắp hết hạn dù kết nối vẫn ok', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ expiresAt: new Date(Date.now() + 2 * 86_400_000) }),
      );
      graph.getPage.mockResolvedValue(probe());

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(true);
      expect(result.message).toContain('CẢNH BÁO');
    });

    it('không ok khi token thiếu scope pages_manage_posts', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ scopes: ['pages_read_engagement'] }),
      );
      graph.getPage.mockResolvedValue(probe());

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.canPost).toBe(false);
      expect(result.message).toContain('pages_manage_posts');
    });

    it('Page ID sai ⇒ chỉ rõ token thuộc page nào, không gọi tới page node', async () => {
      graph.debugToken.mockResolvedValue(tokenInfo({ profileId: '999' }));

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('999');
      // Gọi page node bằng token của page khác chỉ nhận lỗi (#10) khó hiểu.
      expect(graph.getPage).not.toHaveBeenCalled();
    });

    it('token USER thấy được page ⇒ chỉ cần đổi sang Page token', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ type: 'USER', profileId: null }),
      );
      graph.listPages.mockResolvedValue([
        { id: '123456789', name: 'Luca — Hà Nội' },
      ]);

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.tokenType).toBe('USER');
      expect(result.message).toContain('/me/accounts');
    });

    it('token SYSTEM_USER chưa được gán Page nào ⇒ chỉ đúng chỗ cần sửa', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ type: 'SYSTEM_USER', profileId: null }),
      );
      graph.listPages.mockResolvedValue([]);

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.tokenType).toBe('SYSTEM_USER');
      expect(result.message).toContain('chưa được gán Page nào');
      expect(result.message).toContain('Add assets');
    });

    it('token thấy page khác nhưng không thấy page đang cấu hình ⇒ liệt kê ra', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ type: 'SYSTEM_USER', profileId: null }),
      );
      graph.listPages.mockResolvedValue([{ id: '999', name: 'Page khác' }]);

      const result = await service.testConnection('123456789', 'tok');

      expect(result.message).toContain('Page khác (999)');
      expect(result.message).toContain('không có page 123456789');
    });

    it('liệt kê page lỗi thì vẫn trả hướng dẫn, không vỡ test kết nối', async () => {
      graph.debugToken.mockResolvedValue(
        tokenInfo({ type: 'SYSTEM_USER', profileId: null }),
      );
      graph.listPages.mockRejectedValue(new FacebookGraphError('lỗi mạng'));

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('/me/accounts');
    });

    it('token không còn hợp lệ ⇒ báo hết hạn/bị thu hồi', async () => {
      graph.debugToken.mockResolvedValue(tokenInfo({ isValid: false }));

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('hết hạn');
      expect(graph.getPage).not.toHaveBeenCalled();
    });

    it('trả ok:false kèm lý do thay vì ném lỗi khi Graph báo lỗi', async () => {
      graph.debugToken.mockRejectedValue(
        new FacebookGraphError('Access token đã hết hạn', 190),
      );

      const result = await service.testConnection('123456789', 'tok');

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Access token đã hết hạn');
    });

    it('ném tiếp lỗi lạ (không phải lỗi Graph) để filter xử lý', async () => {
      graph.debugToken.mockRejectedValue(new Error('bug lập trình'));

      await expect(service.testConnection('123456789', 'tok')).rejects.toThrow(
        'bug lập trình',
      );
    });

    it('test page đã lưu thì giải mã token trong DB rồi gọi Graph', async () => {
      const enc = crypto.encrypt('stored-token');
      repository.findById.mockResolvedValue(makePage({ accessTokenEnc: enc }));
      graph.debugToken.mockResolvedValue(tokenInfo());
      graph.getPage.mockResolvedValue(probe());

      const result = await service.testSavedPageConnection('page-1');

      expect(result.ok).toBe(true);
      expect(graph.getPage).toHaveBeenCalledWith('123456789', 'stored-token');
    });

    it('test page đã lưu vẫn chạy khi page đang tạm dừng', async () => {
      const enc = crypto.encrypt('stored-token');
      repository.findById.mockResolvedValue(
        makePage({ accessTokenEnc: enc, isActive: false }),
      );
      graph.debugToken.mockResolvedValue(tokenInfo());
      graph.getPage.mockResolvedValue(probe());

      await expect(
        service.testSavedPageConnection('page-1'),
      ).resolves.toMatchObject({ ok: true });
    });

    it('báo phải nhập lại token khi token cũ không giải mã được', async () => {
      const otherCrypto = new CryptoService({
        tokenEncryptionKey: OTHER_KEY,
      } as AppConfigService);
      repository.findById.mockResolvedValue(
        makePage({ accessTokenEnc: otherCrypto.encrypt('old') }),
      );

      const result = await service.testSavedPageConnection('page-1');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('nhập lại access token');
      expect(graph.getPage).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi test page không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.testSavedPageConnection('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
