import type { ValidationError } from 'class-validator';
import { formatErrors, validateEnv } from '../env.validation';

const validEnv = (): Record<string, unknown> => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:55432/db',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '56379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
});

describe('validateEnv — nhánh ép kiểu và gom lỗi', () => {
  it('giữ nguyên giá trị không phải chuỗi/boolean cho field boolean rồi báo lỗi', () => {
    // Nhánh `typeof value !== 'string'` trong toBoolean: số 42 đi thẳng qua, IsBoolean bắt lỗi.
    expect(() => validateEnv({ ...validEnv(), AUTOPOST_ENABLED: 42 })).toThrow(
      /AUTOPOST_ENABLED/,
    );
  });

  it('gom nhiều lỗi vào cùng một message', () => {
    const env = validEnv();
    delete env.DATABASE_URL;
    delete env.REDIS_HOST;

    try {
      validateEnv(env);
      throw new Error('validateEnv lẽ ra phải ném lỗi');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('REDIS_HOST');
    }
  });
});

describe('formatErrors', () => {
  it('liệt kê property kèm mọi constraint', () => {
    const errors = [
      { property: 'PORT', constraints: { isInt: 'PORT must be an integer' } },
    ] as unknown as ValidationError[];

    expect(formatErrors(errors)).toBe('  - PORT: PORT must be an integer');
  });

  it('không vỡ khi error thiếu constraints', () => {
    const errors = [{ property: 'NESTED' }] as unknown as ValidationError[];

    expect(formatErrors(errors)).toBe('  - NESTED: ');
  });
});
