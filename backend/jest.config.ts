import type { Config } from 'jest';

/**
 * Coverage 100% cho tầng service/domain (rule 02).
 * Controller/module/DTO loại trừ — được đảm bảo bằng e2e, không bằng coverage.
 * CẤM hạ ngưỡng hoặc thêm file nghiệp vụ vào ignore để làm xanh CI.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,

  collectCoverageFrom: [
    'src/**/*.service.ts',
    'src/**/guards/**/*.ts',
    'src/**/decorators/**/*.ts',
    'src/**/filters/**/*.ts',
    'src/**/middleware/**/*.ts',
    'src/**/utils/**/*.ts',
    'src/config/env.validation.ts',
    'src/infra/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/generated/',
    '/dist/',
    '\\.module\\.ts$',
    '\\.controller\\.ts$',
    '/dto/',
    '\\.entity\\.ts$',
    'src/main\\.ts$',
    // Chỉ loại thư mục prisma/ ở gốc (schema + seed + migrations).
    // KHÔNG dùng '/prisma/' vì sẽ nuốt luôn src/infra/prisma/prisma.service.ts.
    '<rootDir>/prisma/',
    '\\.spec\\.ts$',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};

export default config;
