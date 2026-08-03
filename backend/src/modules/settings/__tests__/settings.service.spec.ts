import { BadRequestException } from '@nestjs/common';
import type { AppSetting } from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import { DriveAuthMode } from '../../../config/env.validation';
import type { CryptoService } from '../../../infra/crypto/crypto.service';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { UpdateDriveSettingsDto } from '../dto/update-drive-settings.dto';
import type { SettingsRepository } from '../settings.repository';
import { SettingsService } from '../settings.service';
import { SettingKey, type DriveSettingsValue } from '../settings.types';

const ACTOR = 'admin-1';
const SA_JSON = JSON.stringify({ client_email: 'sa@project.iam' });

const makeRecord = (value: Partial<DriveSettingsValue> = {}): AppSetting => ({
  key: SettingKey.GOOGLE_DRIVE,
  value: {
    folderId: 'folder-db',
    serviceAccountJsonEnc: 'enc:tag:cipher',
    maxUploadMb: 500,
    ...value,
  },
  updatedById: ACTOR,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
});

describe('SettingsService', () => {
  let repository: { findByKey: jest.Mock; upsert: jest.Mock };
  let config: AppConfigService;
  let crypto: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
    tryDecrypt: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: SettingsService;

  beforeEach(() => {
    repository = { findByKey: jest.fn(), upsert: jest.fn() };
    config = {
      drive: {
        serviceAccountJson: undefined,
        folderId: undefined,
        maxUploadMb: 200,
      },
    } as AppConfigService;
    crypto = {
      encrypt: jest.fn().mockReturnValue('enc:tag:cipher'),
      decrypt: jest.fn().mockReturnValue(SA_JSON),
      // Bám đúng hành vi thật: tryDecrypt = decrypt, hỏng thì null.
      tryDecrypt: jest.fn((enc: string): string | null => {
        try {
          return crypto.decrypt(enc) as string;
        } catch {
          return null;
        }
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SettingsService(
      repository as unknown as SettingsRepository,
      config,
      crypto as unknown as CryptoService,
      auditService as unknown as AuditService,
    );
  });

  describe('getDriveConfig', () => {
    it('fallback về .env khi DB chưa có bản ghi', async () => {
      repository.findByKey.mockResolvedValue(null);

      const result = await service.getDriveConfig();

      expect(result).toEqual({
        authMode: DriveAuthMode.service_account,
        folderId: null,
        serviceAccountJson: null,
        oauth: null,
        maxUploadMb: 200,
        version: 0,
      });
    });

    it('lấy giá trị .env khi env có folderId và service account', async () => {
      repository.findByKey.mockResolvedValue(null);
      config = {
        drive: {
          serviceAccountJson: SA_JSON,
          folderId: 'folder-env',
          maxUploadMb: 100,
        },
      } as AppConfigService;
      service = new SettingsService(
        repository as unknown as SettingsRepository,
        config,
        crypto as unknown as CryptoService,
        auditService as unknown as AuditService,
      );

      const result = await service.getDriveConfig();

      expect(result.folderId).toBe('folder-env');
      expect(result.serviceAccountJson).toBe(SA_JSON);
    });

    it('ưu tiên bản ghi DB và giải mã service account', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());

      const result = await service.getDriveConfig();

      expect(crypto.decrypt).toHaveBeenCalledWith('enc:tag:cipher');
      expect(result).toEqual({
        authMode: DriveAuthMode.service_account,
        folderId: 'folder-db',
        serviceAccountJson: SA_JSON,
        oauth: null,
        maxUploadMb: 500,
        version: 0,
      });
    });

    it('không giải mã khi DB chưa lưu service account', async () => {
      repository.findByKey.mockResolvedValue(
        makeRecord({ serviceAccountJsonEnc: null }),
      );

      const result = await service.getDriveConfig();

      expect(crypto.decrypt).not.toHaveBeenCalled();
      expect(result.serviceAccountJson).toBeNull();
    });

    it('dùng giá trị env cho field thiếu trong JSON của DB', async () => {
      repository.findByKey.mockResolvedValue({
        ...makeRecord(),
        value: { folderId: 'folder-db' },
      });

      const result = await service.getDriveConfig();

      expect(result.maxUploadMb).toBe(200);
      expect(result.serviceAccountJson).toBeNull();
    });

    it('trả folderId = null khi DB lưu folderId rỗng', async () => {
      repository.findByKey.mockResolvedValue(makeRecord({ folderId: null }));

      const result = await service.getDriveConfig();

      expect(result.folderId).toBeNull();
    });

    it('ném BadRequest khi value trong DB không phải object', async () => {
      repository.findByKey.mockResolvedValue({
        ...makeRecord(),
        value: null,
      });

      await expect(service.getDriveConfig()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getDriveSettings', () => {
    it('trả bản mask từ env, đánh dấu usingEnvFallback khi DB rỗng', async () => {
      repository.findByKey.mockResolvedValue(null);

      const result = await service.getDriveSettings();

      expect(result).toEqual({
        authMode: DriveAuthMode.service_account,
        folderId: null,
        maxUploadMb: 200,
        hasServiceAccount: false,
        serviceAccountEmail: null,
        hasOauthClient: false,
        oauthConnected: false,
        oauthAccountEmail: null,
        usingEnvFallback: true,
        updatedAt: null,
      });
    });

    it('trích client_email từ service account trong env', async () => {
      repository.findByKey.mockResolvedValue(null);
      service = new SettingsService(
        repository as unknown as SettingsRepository,
        {
          drive: {
            serviceAccountJson: SA_JSON,
            folderId: 'folder-env',
            maxUploadMb: 200,
          },
        } as AppConfigService,
        crypto as unknown as CryptoService,
        auditService as unknown as AuditService,
      );

      const result = await service.getDriveSettings();

      expect(result.hasServiceAccount).toBe(true);
      expect(result.serviceAccountEmail).toBe('sa@project.iam');
    });

    it('trả null email khi env chứa đường dẫn file thay vì JSON', async () => {
      repository.findByKey.mockResolvedValue(null);
      service = new SettingsService(
        repository as unknown as SettingsRepository,
        {
          drive: {
            serviceAccountJson: '/secrets/sa.json',
            folderId: 'f',
            maxUploadMb: 200,
          },
        } as AppConfigService,
        crypto as unknown as CryptoService,
        auditService as unknown as AuditService,
      );

      const result = await service.getDriveSettings();

      expect(result.hasServiceAccount).toBe(true);
      expect(result.serviceAccountEmail).toBeNull();
    });

    it('KHÔNG trả service account JSON ra ngoài', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());

      const result = await service.getDriveSettings();

      expect(JSON.stringify(result)).not.toContain('cipher');
      expect(result).toEqual({
        authMode: DriveAuthMode.service_account,
        folderId: 'folder-db',
        maxUploadMb: 500,
        hasServiceAccount: true,
        serviceAccountEmail: 'sa@project.iam',
        hasOauthClient: false,
        oauthConnected: false,
        oauthAccountEmail: null,
        usingEnvFallback: false,
        updatedAt: new Date('2026-01-02'),
      });
    });

    it('hasServiceAccount = false khi DB chưa lưu secret', async () => {
      repository.findByKey.mockResolvedValue(
        makeRecord({ serviceAccountJsonEnc: null }),
      );

      const result = await service.getDriveSettings();

      expect(result.hasServiceAccount).toBe(false);
      expect(result.serviceAccountEmail).toBeNull();
    });

    it('trả null email khi JSON đã lưu không có client_email', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());
      crypto.decrypt.mockReturnValue(JSON.stringify({ client_email: '' }));

      const result = await service.getDriveSettings();

      expect(result.serviceAccountEmail).toBeNull();
    });

    it('trả null email khi JSON giải mã ra không phải object', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());
      crypto.decrypt.mockReturnValue('null');

      const result = await service.getDriveSettings();

      expect(result.serviceAccountEmail).toBeNull();
    });

    it('trả null email khi client_email không phải string', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());
      crypto.decrypt.mockReturnValue(JSON.stringify({ client_email: 123 }));

      const result = await service.getDriveSettings();

      expect(result.serviceAccountEmail).toBeNull();
    });
  });

  describe('updateDriveSettings', () => {
    const dto = (overrides: Partial<UpdateDriveSettingsDto> = {}) => ({
      authMode: DriveAuthMode.service_account,
      maxUploadMb: 300,
      ...overrides,
    });

    it('mã hoá service account mới trước khi lưu', async () => {
      repository.findByKey.mockResolvedValueOnce(null);
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      await service.updateDriveSettings(
        dto({ serviceAccountJson: SA_JSON, folderId: 'f1' }),
        ACTOR,
      );

      expect(crypto.encrypt).toHaveBeenCalledWith(SA_JSON);
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        {
          authMode: DriveAuthMode.service_account,
          folderId: 'f1',
          serviceAccountJsonEnc: 'enc:tag:cipher',
          oauthClientId: null,
          oauthClientSecretEnc: null,
          oauthRefreshTokenEnc: null,
          oauthAccountEmail: null,
          maxUploadMb: 300,
        },
        ACTOR,
      );
    });

    it('giữ nguyên secret cũ khi DTO không gửi serviceAccountJson', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      await service.updateDriveSettings(dto(), ACTOR);

      expect(crypto.encrypt).not.toHaveBeenCalled();
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({ serviceAccountJsonEnc: 'enc:tag:cipher' }),
        ACTOR,
      );
    });

    it('ném BadRequest khi xoá secret mà vẫn giữ authMode=service_account', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      await expect(
        service.updateDriveSettings(dto({ serviceAccountJson: null }), ACTOR),
      ).rejects.toThrow(/Service Account/);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('xoá secret được khi đồng thời chuyển sang authMode=oauth2', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(
        makeRecord({ serviceAccountJsonEnc: null }),
      );

      await service.updateDriveSettings(
        dto({
          serviceAccountJson: null,
          authMode: DriveAuthMode.oauth2,
          oauthClientId: 'cid',
          oauthClientSecret: 'csecret',
        }),
        ACTOR,
      );

      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({ serviceAccountJsonEnc: null }),
        ACTOR,
      );
    });

    it('giữ folderId cũ khi DTO không gửi folderId', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      await service.updateDriveSettings(dto(), ACTOR);

      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({ folderId: 'folder-db' }),
        ACTOR,
      );
    });

    it('ném BadRequest khi JSON service account không có client_email', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({ serviceAccountJson: '{"foo":"bar"}' }),
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('ném BadRequest khi thiếu folderId', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({ serviceAccountJson: SA_JSON }),
          ACTOR,
        ),
      ).rejects.toThrow(/Folder ID/);
    });

    it('ném BadRequest khi folderId rỗng', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({
            folderId: '',
            serviceAccountJson: SA_JSON,
          }),
          ACTOR,
        ),
      ).rejects.toThrow(/Folder ID/);
    });

    it('ném BadRequest khi chưa có service account', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(dto({ folderId: 'f1' }), ACTOR),
      ).rejects.toThrow(/Service Account/);
    });

    it('lưu thành công khi đủ folderId và service account', async () => {
      repository.findByKey.mockResolvedValueOnce(null);
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      const result = await service.updateDriveSettings(
        dto({
          folderId: 'folder-1',
          serviceAccountJson: SA_JSON,
        }),
        ACTOR,
      );

      expect(result.folderId).toBe('folder-db');
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          folderId: 'folder-1',
        }),
        ACTOR,
      );
    });

    it('tăng version để factory dựng lại Drive client', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.upsert.mockResolvedValue(makeRecord());

      const before = await service.getDriveConfig();
      await service.updateDriveSettings(
        dto({ folderId: 'f1', serviceAccountJson: SA_JSON }),
        ACTOR,
      );
      const after = await service.getDriveConfig();

      expect(after.version).toBe(before.version + 1);
    });

    it('ghi audit log không chứa secret', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      await service.updateDriveSettings(dto(), ACTOR);

      const calls = auditService.log.mock.calls as [Record<string, unknown>][];
      const logged = calls[0][0];
      expect(logged.action).toBe(AuditAction.SETTINGS_UPDATE);
      expect(JSON.stringify(logged)).not.toContain('cipher');
      expect(logged.beforeValue).toEqual({
        authMode: DriveAuthMode.service_account,
        folderId: 'folder-db',
        maxUploadMb: 500,
      });
    });

    it('beforeValue = undefined khi tạo cấu hình lần đầu', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.upsert.mockResolvedValue(makeRecord());

      await service.updateDriveSettings(
        dto({ folderId: 'f1', serviceAccountJson: SA_JSON }),
        ACTOR,
      );

      const calls = auditService.log.mock.calls as [Record<string, unknown>][];
      expect(calls[0][0].beforeValue).toBeUndefined();
    });

    it('authMode=oauth2 nhưng thiếu client ⇒ BadRequest', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({ authMode: DriveAuthMode.oauth2 }),
          ACTOR,
        ),
      ).rejects.toThrow(/OAuth Client/);
    });

    it('mã hoá oauthClientSecret và lưu clientId', async () => {
      repository.findByKey.mockResolvedValueOnce(null);
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      crypto.encrypt.mockReturnValue('enc:tag:secret');

      await service.updateDriveSettings(
        dto({
          authMode: DriveAuthMode.oauth2,
          oauthClientId: 'cid',
          oauthClientSecret: 'csecret',
        }),
        ACTOR,
      );

      expect(crypto.encrypt).toHaveBeenCalledWith('csecret');
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          authMode: DriveAuthMode.oauth2,
          oauthClientId: 'cid',
          oauthClientSecretEnc: 'enc:tag:secret',
        }),
        ACTOR,
      );
    });

    it('đổi clientId ⇒ xoá refresh token cũ (buộc kết nối lại)', async () => {
      const connected = makeRecord({
        authMode: DriveAuthMode.oauth2,
        oauthClientId: 'old-cid',
        oauthClientSecretEnc: 'enc:tag:oldsecret',
        oauthRefreshTokenEnc: 'enc:tag:refresh',
        oauthAccountEmail: 'me@gmail.com',
      });
      repository.findByKey.mockResolvedValueOnce(connected);
      repository.upsert.mockResolvedValue(connected);
      repository.findByKey.mockResolvedValueOnce(connected);

      await service.updateDriveSettings(
        dto({
          authMode: DriveAuthMode.oauth2,
          oauthClientId: 'new-cid',
        }),
        ACTOR,
      );

      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          oauthClientId: 'new-cid',
          oauthRefreshTokenEnc: null,
          oauthAccountEmail: null,
        }),
        ACTOR,
      );
    });
  });

  describe('OAuth token flow', () => {
    it('getOauthClientCredentials ném BadRequest khi chưa cấu hình', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(service.getOauthClientCredentials()).rejects.toThrow(
        BadRequestException,
      );
    });

    it('getOauthClientCredentials giải mã client secret', async () => {
      repository.findByKey.mockResolvedValue(
        makeRecord({
          oauthClientId: 'cid',
          oauthClientSecretEnc: 'enc:tag:secret',
        }),
      );
      crypto.decrypt.mockReturnValue('plain-secret');

      const result = await service.getOauthClientCredentials();

      expect(result).toEqual({ clientId: 'cid', clientSecret: 'plain-secret' });
    });

    it('saveOauthTokens mã hoá refresh token và lưu email', async () => {
      const record = makeRecord({
        authMode: DriveAuthMode.oauth2,
        oauthClientId: 'cid',
        oauthClientSecretEnc: 'enc:tag:secret',
      });
      repository.findByKey.mockResolvedValue(record);
      repository.upsert.mockResolvedValue(record);
      crypto.encrypt.mockReturnValue('enc:tag:refresh');

      await service.saveOauthTokens('refresh-123', 'me@gmail.com', ACTOR);

      expect(crypto.encrypt).toHaveBeenCalledWith('refresh-123');
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          oauthRefreshTokenEnc: 'enc:tag:refresh',
          oauthAccountEmail: 'me@gmail.com',
        }),
        ACTOR,
      );
    });

    it('saveOauthTokens ném BadRequest khi chưa có bản ghi cấu hình', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.saveOauthTokens('refresh-123', null, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // Google trả invalid_grant ⇒ token đã chết, phải xoá để UI hiện "chưa kết nối".
  describe('clearOauthTokens', () => {
    const connected = (): AppSetting =>
      makeRecord({
        authMode: DriveAuthMode.oauth2,
        oauthClientId: 'cid',
        oauthClientSecretEnc: 'enc:tag:secret',
        oauthRefreshTokenEnc: 'enc:tag:refresh',
        oauthAccountEmail: 'me@gmail.com',
      });

    it('xoá refresh token + email, giữ nguyên client id/secret', async () => {
      const record = connected();
      repository.findByKey.mockResolvedValue(record);
      repository.upsert.mockResolvedValue(record);

      await service.clearOauthTokens('invalid_grant');

      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          oauthRefreshTokenEnc: null,
          oauthAccountEmail: null,
          oauthClientId: 'cid',
          oauthClientSecretEnc: 'enc:tag:secret',
        }),
        // Hệ thống tự xoá, không phải người dùng ⇒ userId null.
        null,
      );
    });

    it('bump version để DriveStorageFactory dựng lại client', async () => {
      const record = connected();
      repository.findByKey.mockResolvedValue(record);
      repository.upsert.mockResolvedValue(record);
      const before = (await service.getDriveConfig()).version;

      await service.clearOauthTokens('invalid_grant');

      expect((await service.getDriveConfig()).version).toBeGreaterThan(before);
    });

    it('không ghi lại khi vốn đã không có token — tránh bump version vô ích', async () => {
      repository.findByKey.mockResolvedValue(
        makeRecord({ authMode: DriveAuthMode.oauth2, oauthClientId: 'cid' }),
      );

      await service.clearOauthTokens('invalid_grant');

      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('không làm gì khi DB chưa có bản ghi cấu hình', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.clearOauthTokens('invalid_grant'),
      ).resolves.toBeUndefined();
      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });

  // Đổi TOKEN_ENCRYPTION_KEY ⇒ ciphertext cũ trong app_settings thành rác.
  // Đây là lỗi cấu hình ⇒ phải ra 400 chỉ đúng chỗ nhập lại, không phải 500 chung chung.
  describe('secret không giải mã được (đổi TOKEN_ENCRYPTION_KEY)', () => {
    const corrupt = (): void => {
      crypto.decrypt.mockImplementation(() => {
        throw new Error('bad key');
      });
    };

    it('getFacebookAppCredentials ném BadRequest nhắc nhập lại App Secret', async () => {
      repository.findByKey.mockResolvedValue({
        key: SettingKey.FACEBOOK_APP,
        value: { appId: '123', appSecretEnc: 'enc:tag:cipher' },
        updatedById: ACTOR,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });
      corrupt();

      await expect(service.getFacebookAppCredentials()).rejects.toThrow(
        /App Secret/,
      );
      await expect(service.getFacebookAppCredentials()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('getOauthClientCredentials ném BadRequest nhắc nhập lại Client Secret', async () => {
      repository.findByKey.mockResolvedValue(
        makeRecord({
          oauthClientId: 'cid',
          oauthClientSecretEnc: 'enc:tag:secret',
        }),
      );
      corrupt();

      await expect(service.getOauthClientCredentials()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('getDriveSettings vẫn trả về được (chỉ mất serviceAccountEmail)', async () => {
      repository.findByKey.mockResolvedValue(makeRecord());
      corrupt();

      const result = await service.getDriveSettings();

      expect(result.hasServiceAccount).toBe(true);
      expect(result.serviceAccountEmail).toBeNull();
    });
  });
});
