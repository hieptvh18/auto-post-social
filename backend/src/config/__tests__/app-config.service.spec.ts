import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../app-config.service';
import { NodeEnv, type EnvVars } from '../env.validation';

const buildConfig = (overrides: Partial<EnvVars> = {}): AppConfigService => {
  const values: Record<string, unknown> = {
    NODE_ENV: NodeEnv.development,
    PORT: 3100,
    API_PREFIX: 'api',
    TZ_DISPLAY: 'Asia/Ho_Chi_Minh',
    DATABASE_URL: 'postgresql://u:p@localhost:55432/db',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 56379,
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES: '15m',
    JWT_REFRESH_EXPIRES: '7d',
    TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
    GOOGLE_DRIVE_FOLDER_ID: undefined,
    MAX_UPLOAD_MB: 200,
    META_APP_ID: undefined,
    META_APP_SECRET: undefined,
    META_GRAPH_API_VERSION: 'v21.0',
    AUTOPOST_ENABLED: true,
    MAX_POST_PER_SLOT: 20,
    ...overrides,
  };

  const configService = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<EnvVars, true>;

  return new AppConfigService(configService);
};

describe('AppConfigService', () => {
  it('đọc được các giá trị app cơ bản', () => {
    const config = buildConfig();

    expect(config.nodeEnv).toBe(NodeEnv.development);
    expect(config.port).toBe(3100);
    expect(config.apiPrefix).toBe('api');
    expect(config.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(config.databaseUrl).toContain('postgresql://');
    expect(config.tokenEncryptionKey).toHaveLength(64);
  });

  describe('isProduction', () => {
    it('trả về false ở môi trường development', () => {
      expect(buildConfig().isProduction).toBe(false);
    });

    it('trả về true ở môi trường production', () => {
      expect(buildConfig({ NODE_ENV: NodeEnv.production }).isProduction).toBe(
        true,
      );
    });
  });

  it('gom cấu hình redis thành object', () => {
    expect(buildConfig().redis).toEqual({ host: 'localhost', port: 56379 });
  });

  it('gom cấu hình jwt thành object', () => {
    expect(buildConfig().jwt).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      accessExpires: '15m',
      refreshExpires: '7d',
    });
  });

  it('gom cấu hình drive thành object', () => {
    const config = buildConfig({
      GOOGLE_DRIVE_FOLDER_ID: 'folder-1',
      GOOGLE_SERVICE_ACCOUNT_JSON: '/sa.json',
    });

    expect(config.drive).toEqual({
      serviceAccountJson: '/sa.json',
      folderId: 'folder-1',
      maxUploadMb: 200,
    });
  });

  it('gom cấu hình facebook thành object', () => {
    const config = buildConfig({
      META_APP_ID: 'app-1',
      META_APP_SECRET: 'secret-1',
    });

    expect(config.facebook).toEqual({
      appId: 'app-1',
      appSecret: 'secret-1',
      graphVersion: 'v21.0',
    });
  });

  it('gom cấu hình auto-post thành object', () => {
    expect(buildConfig({ AUTOPOST_ENABLED: false }).autoPost).toEqual({
      enabled: false,
      maxPostPerSlot: 20,
    });
  });
});
