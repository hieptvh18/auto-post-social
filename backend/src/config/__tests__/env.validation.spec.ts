import { NodeEnv, validateEnv } from '../env.validation';

/** Env tối thiểu hợp lệ — mỗi test chỉ đổi phần cần kiểm. */
const validEnv = (): Record<string, unknown> => ({
  NODE_ENV: 'development',
  PORT: '3100',
  API_PREFIX: 'api',
  TZ_DISPLAY: 'Asia/Ho_Chi_Minh',
  DATABASE_URL: 'postgresql://u:p@localhost:55432/db',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '56379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
  MAX_UPLOAD_MB: '200',
  META_GRAPH_API_VERSION: 'v21.0',
  AUTOPOST_ENABLED: 'true',
  MAX_POST_PER_SLOT: '20',
});

describe('validateEnv', () => {
  describe('trường hợp hợp lệ', () => {
    it('trả về object đã ép kiểu đúng', () => {
      const result = validateEnv(validEnv());

      expect(result.NODE_ENV).toBe(NodeEnv.development);
      expect(result.PORT).toBe(3100);
      expect(result.REDIS_PORT).toBe(56379);
      expect(result.MAX_UPLOAD_MB).toBe(200);
      expect(result.AUTOPOST_ENABLED).toBe(true);
    });

    it('MEDIA_CACHE_DIR để RỖNG trong .env vẫn hợp lệ, rơi về mặc định', () => {
      // `.env.example` ship key này với giá trị rỗng — nếu validate chặn thì
      // app crash ngay lúc boot trên máy vừa copy file mẫu.
      const env = { ...validEnv(), MEDIA_CACHE_DIR: '' };

      const result = validateEnv(env);

      expect(result.MEDIA_CACHE_DIR).not.toBe('');
      expect(result.MEDIA_CACHE_DIR).toContain('tool-auto-fb-media');
    });

    it('MEDIA_CACHE_DIR khai tường minh thì dùng đúng giá trị đó', () => {
      const result = validateEnv({
        ...validEnv(),
        MEDIA_CACHE_DIR: '/var/cache/tool-auto-fb',
      });

      expect(result.MEDIA_CACHE_DIR).toBe('/var/cache/tool-auto-fb');
    });

    it('timeout đăng Facebook và TTL cache có mặc định dùng được ngay', () => {
      const result = validateEnv(validEnv());

      expect(result.FB_IMAGE_TIMEOUT_MS).toBe(60_000);
      expect(result.FB_VIDEO_TIMEOUT_MS).toBe(900_000);
      expect(result.MEDIA_CACHE_TTL_MS).toBe(600_000);
    });

    it('áp dụng giá trị mặc định khi biến không bắt buộc bị thiếu', () => {
      const env = validEnv();
      delete env.PORT;
      delete env.API_PREFIX;
      delete env.MAX_POST_PER_SLOT;

      const result = validateEnv(env);

      expect(result.PORT).toBe(3001);
      expect(result.API_PREFIX).toBe('api');
      expect(result.MAX_POST_PER_SLOT).toBe(20);
    });

    it('giữ nguyên giá trị boolean khi env đã là boolean', () => {
      const result = validateEnv({ ...validEnv(), AUTOPOST_ENABLED: false });
      expect(result.AUTOPOST_ENABLED).toBe(false);
    });

    it.each([
      ['1', true],
      ['yes', true],
      ['Y', true],
      ['0', false],
      ['false', false],
      ['no', false],
      ['n', false],
    ])('ép chuỗi %s thành boolean %s', (input, expected) => {
      const result = validateEnv({ ...validEnv(), AUTOPOST_ENABLED: input });
      expect(result.AUTOPOST_ENABLED).toBe(expected);
    });

    it('chấp nhận GOOGLE_DRIVE_FOLDER_ID và GOOGLE_SERVICE_ACCOUNT_JSON tuỳ chọn', () => {
      const result = validateEnv({
        ...validEnv(),
        GOOGLE_DRIVE_FOLDER_ID: 'folder-123',
        GOOGLE_SERVICE_ACCOUNT_JSON: '/path/sa.json',
      });

      expect(result.GOOGLE_DRIVE_FOLDER_ID).toBe('folder-123');
    });
  });

  describe('trường hợp không hợp lệ', () => {
    it('ném lỗi khi thiếu biến bắt buộc DATABASE_URL', () => {
      const env = validEnv();
      delete env.DATABASE_URL;

      expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
    });

    it('ném lỗi khi TOKEN_ENCRYPTION_KEY không phải hex 64 ký tự', () => {
      expect(() =>
        validateEnv({ ...validEnv(), TOKEN_ENCRYPTION_KEY: 'quá-ngắn' }),
      ).toThrow(/TOKEN_ENCRYPTION_KEY/);
    });

    it('ném lỗi khi NODE_ENV không thuộc enum', () => {
      expect(() => validateEnv({ ...validEnv(), NODE_ENV: 'staging' })).toThrow(
        /NODE_ENV/,
      );
    });

    it('ném lỗi khi PORT ngoài khoảng cho phép', () => {
      expect(() => validateEnv({ ...validEnv(), PORT: '70000' })).toThrow(
        /PORT/,
      );
    });

    it('ném lỗi khi PORT không phải số', () => {
      expect(() => validateEnv({ ...validEnv(), PORT: 'abc' })).toThrow(/PORT/);
    });

    it('giữ nguyên chuỗi rỗng cho field số nên báo lỗi validate', () => {
      expect(() => validateEnv({ ...validEnv(), REDIS_PORT: '   ' })).toThrow(
        /REDIS_PORT/,
      );
    });

    it('ném lỗi khi AUTOPOST_ENABLED là chuỗi không nhận dạng được', () => {
      expect(() =>
        validateEnv({ ...validEnv(), AUTOPOST_ENABLED: 'maybe' }),
      ).toThrow(/AUTOPOST_ENABLED/);
    });
  });
});
