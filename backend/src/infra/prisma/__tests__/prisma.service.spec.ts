import { Logger } from '@nestjs/common';

const connectMock = jest.fn();
const disconnectMock = jest.fn();
const queryRawMock = jest.fn();
const adapterSpy = jest.fn();

// PrismaClient thật cần kết nối DB — thay bằng lớp giả để test thuần đơn vị.
jest.mock('../../../../generated/prisma/client', () => ({
  PrismaClient: class {
    $connect = connectMock;
    $disconnect = disconnectMock;
    $queryRaw = queryRawMock;
    constructor(public readonly options: unknown) {}
  },
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((options: unknown) => {
    adapterSpy(options);
    return { marker: 'pg-adapter' };
  }),
}));

// jest.mock được hoist lên trước import nên PrismaService nhận đúng lớp giả ở trên.
import { PrismaService } from '../prisma.service';
import type { AppConfigService } from '../../../config/app-config.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let logSpy: jest.SpyInstance;

  const config = {
    databaseUrl: 'postgresql://u:p@localhost:55432/db',
  } as unknown as AppConfigService;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service = new PrismaService(config);
  });

  it('khởi tạo adapter Postgres bằng connection string từ config', () => {
    expect(adapterSpy).toHaveBeenCalledWith({
      connectionString: 'postgresql://u:p@localhost:55432/db',
    });
  });

  it('kết nối và ghi log khi module khởi động', async () => {
    await service.onModuleInit();

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('kết nối'));
  });

  it('ngắt kết nối khi module bị huỷ', async () => {
    await service.onModuleDestroy();

    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('ping chạy truy vấn kiểm tra sức khoẻ DB', async () => {
    queryRawMock.mockResolvedValue([{ '?column?': 1 }]);

    await service.ping();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});
