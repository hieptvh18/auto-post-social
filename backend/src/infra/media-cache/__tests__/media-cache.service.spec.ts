import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../clock/clock.service';
import type { DriveStorageFactory } from '../../drive/drive-storage.factory';
import type { DriveStorage } from '../../drive/drive-storage.interface';
import { MediaCacheService } from '../media-cache.service';

describe('MediaCacheService', () => {
  let cacheDir: string;
  let storage: { createReadStream: jest.Mock<Promise<Readable>, [string]> };
  let driveFactory: { get: jest.Mock<Promise<DriveStorage>, []> };
  let service: MediaCacheService;
  /** Đồng hồ giả — cấm test phụ thuộc giờ chạy thật (rule 01 §Thời gian). */
  let nowMs: number;

  const T0 = Date.parse('2026-08-03T12:00:00.000Z');

  async function makeService(ttlMs = 60_000): Promise<MediaCacheService> {
    const clock: ClockService = { now: () => new Date(nowMs) };
    const instance = new MediaCacheService(
      driveFactory as unknown as DriveStorageFactory,
      {
        mediaCache: { dir: cacheDir, ttlMs },
      } as unknown as AppConfigService,
      clock,
    );
    await instance.onModuleInit();
    return instance;
  }

  beforeEach(async () => {
    nowMs = T0;
    cacheDir = await mkdtemp(join(tmpdir(), 'media-cache-test-'));
    storage = { createReadStream: jest.fn<Promise<Readable>, [string]>() };
    driveFactory = { get: jest.fn<Promise<DriveStorage>, []>() };
    driveFactory.get.mockResolvedValue(storage as unknown as DriveStorage);
    storage.createReadStream.mockImplementation(() =>
      Promise.resolve(Readable.from([Buffer.from('video-bytes')])),
    );
    service = await makeService();
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe('withLocalFile', () => {
    it('tải file từ Drive và giao đường dẫn có nội dung đúng', async () => {
      const content = await service.withLocalFile('drive-1', (file) =>
        readFile(file.path, 'utf8'),
      );

      expect(content).toBe('video-bytes');
    });

    it('trả về size của file đã tải', async () => {
      const size = await service.withLocalFile('drive-1', (file) =>
        Promise.resolve(file.size),
      );

      expect(size).toBe(Buffer.from('video-bytes').length);
    });

    it('CÙNG 1 VIDEO 4 PAGE: gọi 4 lần tuần tự chỉ tải từ Drive ĐÚNG 1 LẦN', async () => {
      for (let i = 0; i < 4; i += 1) {
        await service.withLocalFile('drive-1', () => Promise.resolve(null));
      }

      expect(storage.createReadStream).toHaveBeenCalledTimes(1);
    });

    it('hai driveFileId khác nhau thì tải riêng', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      await service.withLocalFile('drive-2', () => Promise.resolve(null));

      expect(storage.createReadStream).toHaveBeenCalledTimes(2);
    });

    it('gọi SONG SONG cùng một file chỉ mở một kết nối Drive', async () => {
      await Promise.all([
        service.withLocalFile('drive-1', () => Promise.resolve(null)),
        service.withLocalFile('drive-1', () => Promise.resolve(null)),
        service.withLocalFile('drive-1', () => Promise.resolve(null)),
      ]);

      expect(storage.createReadStream).toHaveBeenCalledTimes(1);
    });

    it('trả kết quả của hàm gọi vào', async () => {
      const result = await service.withLocalFile('drive-1', () =>
        Promise.resolve('xong'),
      );

      expect(result).toBe('xong');
    });

    it('ném lại lỗi của hàm gọi vào', async () => {
      await expect(
        service.withLocalFile('drive-1', () =>
          Promise.reject(new Error('Facebook từ chối')),
        ),
      ).rejects.toThrow('Facebook từ chối');
    });

    it('job hỏng vẫn nhả ref ⇒ job sau vẫn dùng lại được file, không tải lại', async () => {
      await service
        .withLocalFile('drive-1', () => Promise.reject(new Error('lỗi')))
        .catch(() => undefined);
      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      expect(storage.createReadStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('vòng đời file trên đĩa', () => {
    it('file vẫn còn ngay sau khi job xong (TTL chưa hết) để page kế tiếp dùng', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      await expect(readdir(cacheDir)).resolves.toEqual(['drive-1']);
    });

    it('sweep khi CHƯA hết TTL thì không xoá gì', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      const removed = await service.sweep(new Date(T0 + 59_000));

      expect(removed).toBe(0);
      await expect(readdir(cacheDir)).resolves.toEqual(['drive-1']);
    });

    it('sweep khi ĐÃ hết TTL thì xoá file khỏi đĩa', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      const removed = await service.sweep(new Date(T0 + 60_001));

      expect(removed).toBe(1);
      await expect(readdir(cacheDir)).resolves.toEqual([]);
    });

    it('TTL tính từ lúc job CUỐI nhả tay, không phải lúc tải về', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      // Page thứ hai mượn lại ở phút thứ 5 ⇒ hạn phải dời theo.
      nowMs = T0 + 300_000;
      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      const removed = await service.sweep(new Date(T0 + 330_000));

      expect(removed).toBe(0);
    });

    it('còn job đang giữ file thì KHÔNG xoá dù TTL đã hết', async () => {
      let removedWhileHeld = -1;
      let seen: string[] = [];

      await service.withLocalFile('drive-1', async () => {
        removedWhileHeld = await service.sweep(new Date(T0 + 999_999));
        seen = await readdir(cacheDir);
      });

      expect(removedWhileHeld).toBe(0);
      expect(seen).toEqual(['drive-1']);
    });

    it('xoá rồi thì lần mượn sau tải lại từ Drive', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      await service.sweep(new Date(T0 + 60_001));

      await service.withLocalFile('drive-1', () => Promise.resolve(null));

      expect(storage.createReadStream).toHaveBeenCalledTimes(2);
    });

    it('dọn sạch thư mục cache lúc khởi động — file sót từ lần chạy trước không được dùng lại', async () => {
      await writeFile(join(cacheDir, 'drive-1'), 'RÁC TỪ LẦN CHẠY TRƯỚC');

      const fresh = await makeService();
      const content = await fresh.withLocalFile('drive-1', (file) =>
        readFile(file.path, 'utf8'),
      );

      expect(content).toBe('video-bytes');
    });
  });

  describe('cron dọn rác', () => {
    it('cron gọi sweep với giờ hiện tại của ClockService', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      // Đồng hồ nhảy quá TTL rồi cron mới chạy.
      nowMs = T0 + 60_001;

      await service.handleSweepCron();

      await expect(readdir(cacheDir)).resolves.toEqual([]);
    });

    it('cron chạy khi chưa tới hạn thì không xoá gì', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      nowMs = T0 + 1_000;

      await service.handleSweepCron();

      await expect(readdir(cacheDir)).resolves.toEqual(['drive-1']);
    });

    it('xoá file hỏng chỉ ghi cảnh báo, KHÔNG ném lỗi làm chết cron', async () => {
      await service.withLocalFile('drive-1', () => Promise.resolve(null));
      // Biến file thành thư mục ⇒ rm(force) không xoá nổi, đúng kiểu lỗi quyền
      // hoặc file đang bị tiến trình khác giữ trên VPS.
      await rm(join(cacheDir, 'drive-1'));
      await mkdir(join(cacheDir, 'drive-1', 'con'), { recursive: true });

      await expect(service.sweep(new Date(T0 + 60_001))).resolves.toBe(0);
    });
  });

  describe('tải hỏng', () => {
    it('ném lỗi ra ngoài, không nuốt', async () => {
      storage.createReadStream.mockRejectedValue(new Error('Drive 404'));

      await expect(
        service.withLocalFile('drive-1', () => Promise.resolve(null)),
      ).rejects.toThrow('Drive 404');
    });

    it('KHÔNG để lại file cụt mang tên thật — nếu để lại, lần sau sẽ đăng video hỏng', async () => {
      storage.createReadStream.mockResolvedValue(
        Readable.from([
          Buffer.from('một-nửa'),
          // Stream đứt giữa chừng, đúng kiểu mạng rớt khi đang tải video lớn.
          Promise.reject(new Error('mạng đứt')),
        ]),
      );

      await expect(
        service.withLocalFile('drive-1', () => Promise.resolve(null)),
      ).rejects.toThrow();
      await expect(readdir(cacheDir)).resolves.toEqual([]);
    });

    it('tải hỏng rồi thử lại thì tải lại từ đầu, không dùng bản dở', async () => {
      storage.createReadStream.mockRejectedValueOnce(new Error('Drive 500'));

      await service
        .withLocalFile('drive-1', () => Promise.resolve(null))
        .catch(() => undefined);
      const content = await service.withLocalFile('drive-1', (file) =>
        readFile(file.path, 'utf8'),
      );

      expect(content).toBe('video-bytes');
      expect(storage.createReadStream).toHaveBeenCalledTimes(2);
    });
  });
});
