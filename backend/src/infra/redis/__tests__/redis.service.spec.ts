import { Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';
import type { AppConfigService } from '../../../config/app-config.service';

const handlers: Record<string, (err: Error) => void> = {};
const mockClient = {
  ping: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn((event: string, cb: (err: Error) => void) => {
    handlers[event] = cb;
  }),
};
const constructorSpy = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((options: unknown) => {
    constructorSpy(options);
    return mockClient;
  }),
}));

describe('RedisService', () => {
  let service: RedisService;
  let errorLog: jest.SpyInstance;

  const config = {
    redis: { host: 'localhost', port: 56379 },
  } as unknown as AppConfigService;

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = new RedisService(config);
  });

  it('khởi tạo client với host/port từ config và maxRetriesPerRequest = null cho BullMQ', () => {
    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 56379,
        maxRetriesPerRequest: null,
      }),
    );
  });

  it('getClient trả về đúng instance ioredis', () => {
    expect(service.getClient()).toBe(mockClient);
  });

  it('ping trả về kết quả từ client', async () => {
    mockClient.ping.mockResolvedValue('PONG');

    await expect(service.ping()).resolves.toBe('PONG');
  });

  it('ghi log khi client phát sự kiện error', () => {
    handlers.error(new Error('kết nối hỏng'));

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('kết nối hỏng'),
    );
  });

  it('ngắt kết nối khi module bị huỷ', () => {
    service.onModuleDestroy();

    expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
