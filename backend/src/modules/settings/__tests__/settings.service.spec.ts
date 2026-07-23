import { BadRequestException } from '@nestjs/common';
import type { AppSetting } from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import { DriverMode } from '../../../config/env.validation';
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
    driver: DriverMode.real,
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
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: SettingsService;

  beforeEach(() => {
    repository = { findByKey: jest.fn(), upsert: jest.fn() };
    config = {
      drive: {
        driver: DriverMode.fake,
        serviceAccountJson: undefined,
        folderId: undefined,
        maxUploadMb: 200,
      },
    } as AppConfigService;
    crypto = {
      encrypt: jest.fn().mockReturnValue('enc:tag:cipher'),
      decrypt: jest.fn().mockReturnValue(SA_JSON),
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
        driver: DriverMode.fake,
        folderId: null,
        serviceAccountJson: null,
        maxUploadMb: 200,
        version: 0,
      });
    });

    it('lấy giá trị .env khi env có folderId và service account', async () => {
      repository.findByKey.mockResolvedValue(null);
      config = {
        drive: {
          driver: DriverMode.real,
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
        driver: DriverMode.real,
        folderId: 'folder-db',
        serviceAccountJson: SA_JSON,
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

      expect(result.driver).toBe(DriverMode.fake);
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
        driver: DriverMode.fake,
        folderId: null,
        maxUploadMb: 200,
        hasServiceAccount: false,
        serviceAccountEmail: null,
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
            driver: DriverMode.real,
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
            driver: DriverMode.real,
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
        driver: DriverMode.real,
        folderId: 'folder-db',
        maxUploadMb: 500,
        hasServiceAccount: true,
        serviceAccountEmail: 'sa@project.iam',
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
      driver: DriverMode.fake,
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
          driver: DriverMode.fake,
          folderId: 'f1',
          serviceAccountJsonEnc: 'enc:tag:cipher',
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

    it('xoá secret khi gửi serviceAccountJson = null', async () => {
      repository.findByKey.mockResolvedValueOnce(makeRecord());
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(
        makeRecord({ serviceAccountJsonEnc: null }),
      );

      await service.updateDriveSettings(
        dto({ serviceAccountJson: null }),
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

    it('ném BadRequest khi driver=real mà thiếu folderId', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({ driver: DriverMode.real, serviceAccountJson: SA_JSON }),
          ACTOR,
        ),
      ).rejects.toThrow(/Folder ID/);
    });

    it('ném BadRequest khi driver=real mà folderId rỗng', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({
            driver: DriverMode.real,
            folderId: '',
            serviceAccountJson: SA_JSON,
          }),
          ACTOR,
        ),
      ).rejects.toThrow(/Folder ID/);
    });

    it('ném BadRequest khi driver=real mà chưa có service account', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.updateDriveSettings(
          dto({ driver: DriverMode.real, folderId: 'f1' }),
          ACTOR,
        ),
      ).rejects.toThrow(/Service Account/);
    });

    it('lưu thành công khi driver=real đủ folderId và service account', async () => {
      repository.findByKey.mockResolvedValueOnce(null);
      repository.upsert.mockResolvedValue(makeRecord());
      repository.findByKey.mockResolvedValueOnce(makeRecord());

      const result = await service.updateDriveSettings(
        dto({
          driver: DriverMode.real,
          folderId: 'folder-1',
          serviceAccountJson: SA_JSON,
        }),
        ACTOR,
      );

      expect(result.driver).toBe(DriverMode.real);
      expect(repository.upsert).toHaveBeenCalledWith(
        SettingKey.GOOGLE_DRIVE,
        expect.objectContaining({
          driver: DriverMode.real,
          folderId: 'folder-1',
        }),
        ACTOR,
      );
    });

    it('tăng version để factory dựng lại Drive client', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.upsert.mockResolvedValue(makeRecord());

      const before = await service.getDriveConfig();
      await service.updateDriveSettings(dto(), ACTOR);
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
        driver: DriverMode.real,
        folderId: 'folder-db',
        maxUploadMb: 500,
      });
    });

    it('beforeValue = undefined khi tạo cấu hình lần đầu', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.upsert.mockResolvedValue(makeRecord());

      await service.updateDriveSettings(dto(), ACTOR);

      const calls = auditService.log.mock.calls as [Record<string, unknown>][];
      expect(calls[0][0].beforeValue).toBeUndefined();
    });
  });
});
