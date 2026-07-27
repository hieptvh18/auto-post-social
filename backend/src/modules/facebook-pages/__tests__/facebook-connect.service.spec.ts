import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  FacebookConnection,
  FacebookPage,
} from '../../../../generated/prisma/client';
import {
  FacebookConnectMode,
  UserRole,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AppConfigService } from '../../../config/app-config.service';
import { CryptoService } from '../../../infra/crypto/crypto.service';
import type { FacebookGraphClient } from '../../../infra/facebook/facebook-graph.client';
import type {
  FacebookAppCredentials,
  FacebookPageWithToken,
  FacebookTokenInfo,
  FacebookUserProfile,
  FacebookUserToken,
} from '../../../infra/facebook/facebook-graph.interface';
import type { CreateAuditLogData } from '../../audit/audit.repository';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { SettingsService } from '../../settings/settings.service';
import { FacebookConnectService } from '../facebook-connect.service';
import type {
  ConnectionWithPageCount,
  FacebookConnectionsRepository,
  UpsertConnectionData,
} from '../facebook-connections.repository';
import type {
  CreateFacebookPageData,
  FacebookPagesRepository,
  UpdateFacebookPageData,
} from '../facebook-pages.repository';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
const NOW = new Date('2026-07-26T10:00:00.000Z');

const APP: FacebookAppCredentials = {
  appId: '1029384756102938',
  appSecret: 'app-secret',
};

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@company.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};

const makeConnection = (
  overrides: Partial<FacebookConnection> = {},
): FacebookConnection => ({
  id: 'conn-1',
  fbUserId: '61550293847561',
  fbUserName: 'Hiệp Trần',
  userTokenEnc: 'set-in-beforeEach',
  tokenExpireAt: new Date('2026-09-24T10:00:00.000Z'),
  scopes: ['pages_show_list', 'pages_manage_posts'],
  revokedAt: null,
  connectedById: admin.id,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makePage = (overrides: Partial<FacebookPage> = {}): FacebookPage => ({
  id: 'page-uuid-1',
  pageName: 'Luca Coffee — Cầu Giấy',
  pageId: '771029384756102',
  accessTokenEnc: 'unused-in-most-tests',
  tokenExpireAt: null,
  isActive: true,
  autopostEnabled: false,
  deletedAt: null,
  connectMode: FacebookConnectMode.MANUAL_TOKEN,
  connectionId: null,
  createdById: admin.id,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeRemotePage = (
  overrides: Partial<FacebookPageWithToken> = {},
): FacebookPageWithToken => ({
  id: '771029384756102',
  name: 'Luca Coffee — Cầu Giấy',
  category: 'Coffee shop',
  accessToken: 'EAA-page-token-vinh-vien',
  tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE', 'CREATE_CONTENT', 'MANAGE'],
  ...overrides,
});

describe('FacebookConnectService', () => {
  let connections: {
    findMany: jest.Mock<Promise<ConnectionWithPageCount[]>, []>;
    findById: jest.Mock<Promise<FacebookConnection | null>, [string]>;
    upsertByFbUserId: jest.Mock<
      Promise<FacebookConnection>,
      [UpsertConnectionData]
    >;
    revoke: jest.Mock<Promise<FacebookConnection>, [string]>;
  };
  let pages: {
    findById: jest.Mock<Promise<FacebookPage | null>, [string]>;
    findByPageId: jest.Mock<Promise<FacebookPage | null>, [string]>;
    findManyByPageIds: jest.Mock<Promise<FacebookPage[]>, [string[]]>;
    create: jest.Mock<Promise<FacebookPage>, [CreateFacebookPageData]>;
    update: jest.Mock<Promise<FacebookPage>, [string, UpdateFacebookPageData]>;
  };
  let graph: {
    exchangeCodeForUserToken: jest.Mock<Promise<FacebookUserToken>, unknown[]>;
    exchangeLongLivedUserToken: jest.Mock<
      Promise<FacebookUserToken>,
      unknown[]
    >;
    getMe: jest.Mock<Promise<FacebookUserProfile>, unknown[]>;
    debugToken: jest.Mock<Promise<FacebookTokenInfo>, [string]>;
    listPagesWithTokens: jest.Mock<Promise<FacebookPageWithToken[]>, unknown[]>;
  };
  let settings: {
    getFacebookAppCredentials: jest.Mock<Promise<FacebookAppCredentials>, []>;
  };
  let audit: { log: jest.Mock<Promise<void>, [CreateAuditLogData]> };
  let clock: { now: jest.Mock<Date, []> };
  let crypto: CryptoService;
  let service: FacebookConnectService;

  const config = {
    appBaseUrl: 'https://app.local',
    apiPrefix: 'api',
    facebook: { graphVersion: 'v21.0' },
  } as unknown as AppConfigService;

  const build = (): FacebookConnectService =>
    new FacebookConnectService(
      connections as unknown as FacebookConnectionsRepository,
      pages as unknown as FacebookPagesRepository,
      crypto,
      graph as unknown as FacebookGraphClient,
      settings as unknown as SettingsService,
      audit as unknown as AuditService,
      clock,
      config,
    );

  /** Đi qua trọn luồng OAuth để lấy state hợp lệ — nhiều test cần state thật. */
  const connectOnce = async (): Promise<string> => {
    const url = await service.buildAuthUrl(admin.id);
    const state = new URL(url).searchParams.get('state') as string;
    return service.handleCallback('the-code', state);
  };

  beforeEach(() => {
    connections = {
      findMany: jest.fn<Promise<ConnectionWithPageCount[]>, []>(),
      findById: jest.fn<Promise<FacebookConnection | null>, [string]>(),
      upsertByFbUserId: jest.fn<
        Promise<FacebookConnection>,
        [UpsertConnectionData]
      >(),
      revoke: jest.fn<Promise<FacebookConnection>, [string]>(),
    };
    pages = {
      findById: jest.fn<Promise<FacebookPage | null>, [string]>(),
      findByPageId: jest.fn<Promise<FacebookPage | null>, [string]>(),
      findManyByPageIds: jest.fn<Promise<FacebookPage[]>, [string[]]>(),
      create: jest.fn<Promise<FacebookPage>, [CreateFacebookPageData]>(),
      update: jest.fn<
        Promise<FacebookPage>,
        [string, UpdateFacebookPageData]
      >(),
    };
    graph = {
      exchangeCodeForUserToken: jest.fn<
        Promise<FacebookUserToken>,
        unknown[]
      >(),
      exchangeLongLivedUserToken: jest.fn<
        Promise<FacebookUserToken>,
        unknown[]
      >(),
      getMe: jest.fn<Promise<FacebookUserProfile>, unknown[]>(),
      debugToken: jest.fn<Promise<FacebookTokenInfo>, [string]>(),
      listPagesWithTokens: jest.fn<
        Promise<FacebookPageWithToken[]>,
        unknown[]
      >(),
    };
    settings = {
      getFacebookAppCredentials: jest
        .fn<Promise<FacebookAppCredentials>, []>()
        .mockResolvedValue(APP),
    };
    audit = { log: jest.fn<Promise<void>, [CreateAuditLogData]>() };
    clock = { now: jest.fn<Date, []>(() => NOW) };
    crypto = new CryptoService({ tokenEncryptionKey: KEY } as AppConfigService);

    // Mặc định: luồng OAuth chạy trơn tru. Test nào cần hỏng thì override lại.
    graph.exchangeCodeForUserToken.mockResolvedValue({
      token: 'short-lived-token',
      expiresAt: new Date('2026-07-26T12:00:00.000Z'),
    });
    graph.exchangeLongLivedUserToken.mockResolvedValue({
      token: 'long-lived-token',
      expiresAt: new Date('2026-09-24T10:00:00.000Z'),
    });
    graph.getMe.mockResolvedValue({ id: '61550293847561', name: 'Hiệp Trần' });
    graph.debugToken.mockResolvedValue({
      type: 'USER',
      isValid: true,
      profileId: '61550293847561',
      scopes: ['pages_show_list', 'pages_manage_posts'],
      expiresAt: new Date('2026-09-24T10:00:00.000Z'),
    });
    connections.upsertByFbUserId.mockImplementation((data) =>
      Promise.resolve(makeConnection({ userTokenEnc: data.userTokenEnc })),
    );
    connections.findById.mockImplementation(() =>
      Promise.resolve(
        makeConnection({ userTokenEnc: crypto.encrypt('long-lived-token') }),
      ),
    );

    service = build();
  });

  describe('buildAuthUrl', () => {
    it('trả URL dialog kèm đủ scope đăng bài, redirect URI và state', async () => {
      const url = new URL(await service.buildAuthUrl(admin.id));

      expect(url.origin + url.pathname).toBe(
        'https://www.facebook.com/v21.0/dialog/oauth',
      );
      expect(url.searchParams.get('client_id')).toBe(APP.appId);
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://app.local/api/pages/connect/callback',
      );
      expect(url.searchParams.get('scope')).toContain('pages_manage_posts');
      expect(url.searchParams.get('state')).toHaveLength(48);
    });

    it('ném lỗi khi chưa khai báo Facebook App', async () => {
      settings.getFacebookAppCredentials.mockRejectedValue(
        new BadRequestException('Chưa khai báo Facebook App'),
      );

      await expect(service.buildAuthUrl(admin.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleCallback', () => {
    it('đổi code sang token NGẮN hạn rồi mới sang token DÀI hạn', async () => {
      await connectOnce();

      expect(graph.exchangeCodeForUserToken).toHaveBeenCalledWith(
        'the-code',
        'https://app.local/api/pages/connect/callback',
        APP,
      );
      // Bỏ bước này thì Page token lấy được cũng chỉ sống vài giờ.
      expect(graph.exchangeLongLivedUserToken).toHaveBeenCalledWith(
        'short-lived-token',
        APP,
      );
    });

    it('lưu user token dài hạn ở dạng đã mã hoá, không lưu plaintext', async () => {
      await connectOnce();

      const saved = connections.upsertByFbUserId.mock.calls[0][0];
      expect(saved.userTokenEnc).not.toContain('long-lived-token');
      expect(crypto.decrypt(saved.userTokenEnc)).toBe('long-lived-token');
      expect(saved.fbUserId).toBe('61550293847561');
      expect(saved.connectedById).toBe(admin.id);
    });

    it('lấy hạn token và scope từ debug_token', async () => {
      await connectOnce();

      const saved = connections.upsertByFbUserId.mock.calls[0][0];
      expect(saved.tokenExpireAt).toEqual(new Date('2026-09-24T10:00:00.000Z'));
      expect(saved.scopes).toEqual(['pages_show_list', 'pages_manage_posts']);
    });

    it('ghi audit PAGE_CONNECT_FB nhưng không ghi token vào audit', async () => {
      await connectOnce();

      const logged = audit.log.mock.calls[0][0];
      expect(logged.action).toBe(AuditAction.PAGE_CONNECT_FB);
      expect(JSON.stringify(logged)).not.toContain('long-lived-token');
    });

    it('dùng lại state lần thứ hai ⇒ 400 (single-use)', async () => {
      const url = await service.buildAuthUrl(admin.id);
      const state = new URL(url).searchParams.get('state') as string;

      await service.handleCallback('code-1', state);

      await expect(service.handleCallback('code-2', state)).rejects.toThrow(
        BadRequestException,
      );
      expect(connections.upsertByFbUserId).toHaveBeenCalledTimes(1);
    });

    it('state quá hạn 10 phút ⇒ 400', async () => {
      const url = await service.buildAuthUrl(admin.id);
      const state = new URL(url).searchParams.get('state') as string;
      clock.now.mockReturnValue(new Date(NOW.getTime() + 11 * 60 * 1000));

      await expect(service.handleCallback('the-code', state)).rejects.toThrow(
        BadRequestException,
      );
      expect(connections.upsertByFbUserId).not.toHaveBeenCalled();
    });

    it('state không tồn tại ⇒ 400, không gọi Graph', async () => {
      await expect(
        service.handleCallback('the-code', 'state-bia-dat'),
      ).rejects.toThrow(BadRequestException);
      expect(graph.exchangeCodeForUserToken).not.toHaveBeenCalled();
    });
  });

  describe('listCandidates', () => {
    it('đánh dấu page thiếu CREATE_CONTENT là không nhập được, kèm lý do', async () => {
      graph.listPagesWithTokens.mockResolvedValue([
        makeRemotePage({ id: 'p-ok' }),
        makeRemotePage({ id: 'p-readonly', tasks: ['ANALYZE'] }),
      ]);
      pages.findManyByPageIds.mockResolvedValue([]);

      const result = await service.listCandidates('conn-1');

      expect(result[0]).toMatchObject({ canPost: true, importable: true });
      expect(result[1].importable).toBe(false);
      expect(result[1].blockedReason).toContain('không có quyền tạo nội dung');
    });

    it('nói rõ page đã có trong hệ thống đang dùng nguồn token nào', async () => {
      graph.listPagesWithTokens.mockResolvedValue([makeRemotePage()]);
      pages.findManyByPageIds.mockResolvedValue([makePage()]);

      const [candidate] = await service.listCandidates('conn-1');

      expect(candidate.alreadyAdded).toBe(true);
      expect(candidate.currentConnectMode).toBe(
        FacebookConnectMode.MANUAL_TOKEN,
      );
    });

    it('page đã xoá mềm coi như chưa có — import sẽ hồi sinh', async () => {
      graph.listPagesWithTokens.mockResolvedValue([makeRemotePage()]);
      pages.findManyByPageIds.mockResolvedValue([
        makePage({ deletedAt: new Date('2026-07-20') }),
      ]);

      const [candidate] = await service.listCandidates('conn-1');

      expect(candidate.alreadyAdded).toBe(false);
      expect(candidate.currentConnectMode).toBeNull();
    });

    it('kết nối đã ngắt ⇒ 404', async () => {
      connections.findById.mockResolvedValue(
        makeConnection({ revokedAt: NOW, userTokenEnc: null }),
      );

      await expect(service.listCandidates('conn-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('token đã lưu không giải mã được (đổi khoá) ⇒ 400 nói cách khắc phục', async () => {
      const otherCrypto = new CryptoService({
        tokenEncryptionKey: OTHER_KEY,
      } as AppConfigService);
      connections.findById.mockResolvedValue(
        makeConnection({
          userTokenEnc: otherCrypto.encrypt('long-lived-token'),
        }),
      );

      await expect(service.listCandidates('conn-1')).rejects.toThrow(
        /khoá mã hoá đã thay đổi/,
      );
    });
  });

  describe('importPages', () => {
    beforeEach(() => {
      graph.listPagesWithTokens.mockResolvedValue([makeRemotePage()]);
      pages.create.mockImplementation((data) =>
        Promise.resolve(
          makePage({
            accessTokenEnc: data.accessTokenEnc,
            connectMode: data.connectMode ?? FacebookConnectMode.MANUAL_TOKEN,
            connectionId: data.connectionId ?? null,
          }),
        ),
      );
      pages.update.mockImplementation((id, data) =>
        Promise.resolve({ ...makePage({ id }), ...data }),
      );
    });

    it('tạo page mới với connectMode FB_LOGIN và gắn connectionId', async () => {
      pages.findByPageId.mockResolvedValue(null);

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      const created = pages.create.mock.calls[0][0];
      expect(created.connectMode).toBe(FacebookConnectMode.FB_LOGIN);
      expect(created.connectionId).toBe('conn-1');
      expect(result.imported).toHaveLength(1);
    });

    it('lưu Page token đã mã hoá, giải mã ra đúng token Graph trả về', async () => {
      pages.findByPageId.mockResolvedValue(null);

      await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      const created = pages.create.mock.calls[0][0];
      expect(created.accessTokenEnc).not.toContain('EAA-page-token-vinh-vien');
      expect(crypto.decrypt(created.accessTokenEnc)).toBe(
        'EAA-page-token-vinh-vien',
      );
    });

    it('hồi sinh page đã xoá mềm thay vì tạo dòng mới', async () => {
      pages.findByPageId.mockResolvedValue(
        makePage({ deletedAt: new Date('2026-07-20'), isActive: false }),
      );

      await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      expect(pages.create).not.toHaveBeenCalled();
      const [, data] = pages.update.mock.calls[0];
      expect(data.deletedAt).toBeNull();
      expect(data.isActive).toBe(true);
      expect(data.connectMode).toBe(FacebookConnectMode.FB_LOGIN);
    });

    it('page đang là FB_LOGIN ⇒ ghi đè token, không hỏi lại', async () => {
      pages.findByPageId.mockResolvedValue(
        makePage({
          connectMode: FacebookConnectMode.FB_LOGIN,
          connectionId: 'conn-1',
        }),
      );

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      expect(result.needsConfirm).toHaveLength(0);
      const [, data] = pages.update.mock.calls[0];
      expect(crypto.decrypt(data.accessTokenEnc as string)).toBe(
        'EAA-page-token-vinh-vien',
      );
      // Page token dẫn xuất từ user token dài hạn thì không có hạn.
      expect(data.tokenExpireAt).toBeNull();
    });

    it('page đang dùng token dán tay ⇒ KHÔNG ghi đè, trả needsConfirm', async () => {
      pages.findByPageId.mockResolvedValue(
        makePage({ connectMode: FacebookConnectMode.MANUAL_TOKEN }),
      );

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      expect(result.needsConfirm).toEqual([
        { pageId: '771029384756102', pageName: 'Luca Coffee — Cầu Giấy' },
      ]);
      expect(result.imported).toHaveLength(0);
      expect(pages.update).not.toHaveBeenCalled();
    });

    it('page dán tay + overwriteManual = true ⇒ mới ghi đè', async () => {
      pages.findByPageId.mockResolvedValue(
        makePage({ connectMode: FacebookConnectMode.MANUAL_TOKEN }),
      );

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'], overwriteManual: true },
        admin,
      );

      expect(result.needsConfirm).toHaveLength(0);
      expect(result.imported).toHaveLength(1);
      const [, data] = pages.update.mock.calls[0];
      expect(data.connectMode).toBe(FacebookConnectMode.FB_LOGIN);
    });

    it('page thiếu CREATE_CONTENT ⇒ bỏ qua kèm lý do, không đụng DB', async () => {
      graph.listPagesWithTokens.mockResolvedValue([
        makeRemotePage({ tasks: ['ANALYZE'] }),
      ]);

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      expect(result.imported).toHaveLength(0);
      expect(result.skipped[0].reason).toContain('Không có quyền tạo nội dung');
      expect(pages.create).not.toHaveBeenCalled();
      expect(pages.update).not.toHaveBeenCalled();
    });

    it('pageId không nằm trong tài khoản ⇒ bỏ qua, không tạo page rỗng', async () => {
      const result = await service.importPages(
        'conn-1',
        { pageIds: ['page-la-hoac'] },
        admin,
      );

      expect(result.skipped).toEqual([
        {
          pageId: 'page-la-hoac',
          reason: expect.stringContaining('không còn thấy page đó') as string,
        },
      ]);
      expect(pages.create).not.toHaveBeenCalled();
    });

    it('response của page import không chứa token thô', async () => {
      pages.findByPageId.mockResolvedValue(null);

      const result = await service.importPages(
        'conn-1',
        { pageIds: ['771029384756102'] },
        admin,
      );

      expect(JSON.stringify(result.imported)).not.toContain(
        'EAA-page-token-vinh-vien',
      );
      // Chỉ còn 4 ký tự cuối (rule 01 §Bảo mật).
      expect(result.imported[0].accessTokenMasked).toBe('••••vien');
    });
  });

  describe('refreshPageToken', () => {
    it('page dán tay ⇒ 400, không có gì để tạo lại token', async () => {
      pages.findById.mockResolvedValue(makePage({ connectionId: null }));

      await expect(
        service.refreshPageToken('page-uuid-1', admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('page FB_LOGIN ⇒ lấy token mới và xoá hạn token cũ', async () => {
      pages.findById.mockResolvedValue(
        makePage({
          connectMode: FacebookConnectMode.FB_LOGIN,
          connectionId: 'conn-1',
          tokenExpireAt: new Date('2026-08-01'),
        }),
      );
      graph.listPagesWithTokens.mockResolvedValue([
        makeRemotePage({ accessToken: 'EAA-token-moi' }),
      ]);
      pages.update.mockImplementation((id, data) =>
        Promise.resolve({ ...makePage({ id }), ...data }),
      );

      await service.refreshPageToken('page-uuid-1', admin);

      const [, data] = pages.update.mock.calls[0];
      expect(crypto.decrypt(data.accessTokenEnc as string)).toBe(
        'EAA-token-moi',
      );
      expect(data.tokenExpireAt).toBeNull();
    });

    it('tài khoản không còn thấy page (bị gỡ quyền) ⇒ 400 nói đúng nguyên nhân', async () => {
      pages.findById.mockResolvedValue(
        makePage({
          connectMode: FacebookConnectMode.FB_LOGIN,
          connectionId: 'conn-1',
        }),
      );
      graph.listPagesWithTokens.mockResolvedValue([]);

      await expect(
        service.refreshPageToken('page-uuid-1', admin),
      ).rejects.toThrow(/gỡ quyền khỏi Page/);
    });

    it('không tìm thấy page ⇒ 404', async () => {
      pages.findById.mockResolvedValue(null);

      await expect(
        service.refreshPageToken('page-uuid-1', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('xoá token của kết nối nhưng KHÔNG đụng token của page đang chạy', async () => {
      connections.revoke.mockResolvedValue(
        makeConnection({ revokedAt: NOW, userTokenEnc: null }),
      );

      await service.revoke('conn-1', admin);

      expect(connections.revoke).toHaveBeenCalledWith('conn-1');
      expect(pages.update).not.toHaveBeenCalled();
      expect(audit.log.mock.calls[0][0].action).toBe(
        AuditAction.PAGE_CONNECT_REVOKE,
      );
    });

    it('kết nối đã ngắt trước đó ⇒ 404', async () => {
      connections.findById.mockResolvedValue(
        makeConnection({ revokedAt: NOW, userTokenEnc: null }),
      );

      await expect(service.revoke('conn-1', admin)).rejects.toThrow(
        NotFoundException,
      );
      expect(connections.revoke).not.toHaveBeenCalled();
    });
  });

  describe('listConnections', () => {
    it('trả cảnh báo số ngày còn lại và KHÔNG trả token', async () => {
      connections.findMany.mockResolvedValue([
        {
          ...makeConnection({
            userTokenEnc: crypto.encrypt('long-lived-token'),
            tokenExpireAt: new Date('2026-07-31T10:00:00.000Z'),
          }),
          pageCount: 2,
        },
      ]);

      const [connection] = await service.listConnections();

      expect(connection.daysUntilExpire).toBe(5);
      expect(connection.pageCount).toBe(2);
      expect(JSON.stringify(connection)).not.toContain('long-lived-token');
      expect(Object.keys(connection)).not.toContain('userTokenEnc');
    });

    it('token không hết hạn ⇒ daysUntilExpire = null', async () => {
      connections.findMany.mockResolvedValue([
        { ...makeConnection({ tokenExpireAt: null }), pageCount: 0 },
      ]);

      const [connection] = await service.listConnections();

      expect(connection.daysUntilExpire).toBeNull();
    });
  });
});
