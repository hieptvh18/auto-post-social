import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import type { AppConfigService } from '../../../config/app-config.service';
import type { SettingsService } from '../../../modules/settings/settings.service';
import { PythonReupAdapter } from '../python-reup.adapter';
import {
  DownloadFailedError,
  DownloaderContractMismatchError,
  DownloaderParseError,
  DownloaderTimeoutError,
  DownloaderUnavailableError,
  ReupVideoUnavailableError,
  YoutubeInvalidApiKeyError,
  YoutubeNotConfiguredError,
  YoutubeQuotaExceededError,
} from '../reup-downloader.errors';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  constants: { X_OK: 1, R_OK: 4 },
}));

const spawnMock = childProcess.spawn as unknown as jest.Mock;
const accessMock = fsPromises.access as unknown as jest.Mock;

const REUP_CONFIG = {
  pythonBin: '/fake/.venv/bin/python3',
  projectDir: '/fake/ai-video-downloader',
  tmpDir: '/tmp/reup',
  downloadTimeoutMs: 600_000,
};

/** Process con giả — cho phép bơm stdout/stderr rồi đóng với exit code mong muốn. */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 4242;
  kill = jest.fn();
}

/**
 * Lên lịch cho process giả phát dữ liệu ở tick sau — adapter phải kịp gắn
 * listener trước đó (đúng như process thật).
 */
function scheduleProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Không bao giờ đóng ⇒ dùng để test timeout. */
  hang?: boolean;
}): FakeChild {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child);

  if (options.hang !== true) {
    setImmediate(() => {
      if (options.stdout !== undefined) {
        child.stdout.emit('data', Buffer.from(options.stdout, 'utf8'));
      }
      if (options.stderr !== undefined) {
        child.stderr.emit('data', Buffer.from(options.stderr, 'utf8'));
      }
      child.emit('close', options.exitCode ?? 0);
    });
  }
  return child;
}

const okSearchPayload = JSON.stringify({
  contractVersion: 1,
  ok: true,
  videos: [
    {
      externalId: 'abc123',
      title: 'Mẹo nấu ăn',
      authorName: 'Bếp nhà',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123',
      publishedAt: '2026-08-01T10:00:00Z',
      durationSec: 63,
      viewCount: 152340,
      thumbnailUrl: 'https://i.ytimg.com/abc123.jpg',
    },
  ],
});

describe('PythonReupAdapter', () => {
  let config: { reup: typeof REUP_CONFIG };
  let settings: { getYoutubeApiKey: jest.Mock };
  let adapter: PythonReupAdapter;

  const searchParams = {
    keyword: 'mẹo nấu ăn',
    maxResults: 10,
    regionCode: 'VN',
    publishedAfterDays: 30,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
    config = { reup: { ...REUP_CONFIG } };
    settings = {
      getYoutubeApiKey: jest.fn().mockResolvedValue('fake-key-1234'),
    };

    adapter = new PythonReupAdapter(
      config as unknown as AppConfigService,
      settings as unknown as SettingsService,
    );
  });

  describe('search', () => {
    it('stdout JSON hợp lệ ⇒ trả về đúng danh sách đã map', async () => {
      scheduleProcess({ stdout: okSearchPayload });

      const videos = await adapter.search(searchParams);

      expect(videos).toEqual([
        {
          externalId: 'abc123',
          title: 'Mẹo nấu ăn',
          authorName: 'Bếp nhà',
          sourceUrl: 'https://www.youtube.com/watch?v=abc123',
          publishedAt: '2026-08-01T10:00:00Z',
          durationSec: 63,
          viewCount: 152340,
          thumbnailUrl: 'https://i.ytimg.com/abc123.jpg',
        },
      ]);
    });

    /**
     * Cạm bẫy C4: `rich`/progress bar lọt vào stdout. Hợp đồng nói stdout chỉ có
     * 1 dòng JSON, nhưng đây là biên với process ngoài nên phải chịu được rác.
     */
    it('stdout lẫn rác TRƯỚC dòng JSON ⇒ vẫn parse được, không crash', async () => {
      scheduleProcess({
        stdout: `Đang tải...\n[####] 50%\n${okSearchPayload}\n`,
      });

      const videos = await adapter.search(searchParams);

      expect(videos).toHaveLength(1);
    });

    it('stdout KHÔNG có dòng JSON nào ⇒ ParseError rõ nghĩa', async () => {
      scheduleProcess({ stdout: 'chỉ toàn log người đọc\nkhông có JSON\n' });

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderParseError,
      );
    });

    it('viewCount vắng mặt ⇒ null, KHÔNG quy về 0', async () => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 1,
          ok: true,
          videos: [
            {
              externalId: 'x',
              title: 't',
              authorName: 'a',
              sourceUrl: 'u',
              publishedAt: null,
              durationSec: null,
              viewCount: null,
              thumbnailUrl: null,
            },
          ],
        }),
      });

      const [video] = await adapter.search(searchParams);

      expect(video.viewCount).toBeNull();
      expect(video.durationSec).toBeNull();
    });

    it.each([
      ['QUOTA_EXCEEDED', YoutubeQuotaExceededError],
      ['INVALID_API_KEY', YoutubeInvalidApiKeyError],
      ['VIDEO_UNAVAILABLE', ReupVideoUnavailableError],
      ['DOWNLOAD_FAILED', DownloadFailedError],
      ['UNKNOWN', DownloadFailedError],
    ])('errorCode %s ⇒ ném đúng domain error', async (code, expected) => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 1,
          ok: false,
          errorCode: code,
          message: 'lỗi từ python',
        }),
        exitCode: 1,
      });

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        expected,
      );
    });

    it('chưa cấu hình API key ⇒ YoutubeNotConfiguredError và KHÔNG spawn', async () => {
      settings.getYoutubeApiKey.mockResolvedValue(null);

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        YoutubeNotConfiguredError,
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('API key đi qua ENV của process con, KHÔNG qua argv (ps không thấy)', async () => {
      scheduleProcess({ stdout: okSearchPayload });

      await adapter.search(searchParams);

      const [, args, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { env: Record<string, string> },
      ];

      expect(args.join(' ')).not.toContain('fake-key-1234');
      expect(options.env.YOUTUBE_API_KEY).toBe('fake-key-1234');
    });

    it('contractVersion lệch ⇒ ContractMismatch, KHÔNG parse tiếp payload', async () => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 99,
          ok: true,
          videos: [{ externalId: 'x' }],
        }),
      });

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderContractMismatchError,
      );
    });

    it('contractVersion lệch được ưu tiên kiểm TRƯỚC cả ok:false', async () => {
      // Version sai thì mọi field bên trong đều không đáng tin, kể cả errorCode.
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 2,
          ok: false,
          errorCode: 'QUOTA_EXCEEDED',
        }),
        exitCode: 1,
      });

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderContractMismatchError,
      );
    });
  });

  describe('độc lập với downloader (QĐ-6)', () => {
    it('thiếu REUP_PYTHON_BIN ⇒ Unavailable, KHÔNG spawn', async () => {
      config.reup.pythonBin = undefined as unknown as string;

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderUnavailableError,
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('thiếu REUP_PROJECT_DIR ⇒ Unavailable, KHÔNG spawn', async () => {
      config.reup.projectDir = undefined as unknown as string;

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderUnavailableError,
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('REUP_PYTHON_BIN trỏ file không tồn tại ⇒ Unavailable, KHÔNG spawn', async () => {
      accessMock.mockRejectedValue(new Error('ENOENT'));

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderUnavailableError,
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('spawn ném ENOENT ⇒ Unavailable, KHÔNG phải lỗi chung', async () => {
      const child = new FakeChild();
      spawnMock.mockReturnValue(child);
      setImmediate(() => {
        const error: NodeJS.ErrnoException = new Error('spawn ENOENT');
        error.code = 'ENOENT';
        child.emit('error', error);
      });

      await expect(adapter.search(searchParams)).rejects.toBeInstanceOf(
        DownloaderUnavailableError,
      );
    });

    /**
     * Gộp 2 loại lỗi này làm một thì không phân biệt được "chưa cài downloader"
     * với "cài rồi nhưng video hỏng" — hai thứ đòi hành động khác hẳn nhau.
     */
    it('DownloaderUnavailableError KHÁC KIỂU với lỗi vận hành', () => {
      const unavailable = new DownloaderUnavailableError('chưa cài');

      expect(unavailable).not.toBeInstanceOf(DownloadFailedError);
      expect(unavailable).not.toBeInstanceOf(YoutubeQuotaExceededError);
      expect(new DownloadFailedError('x')).not.toBeInstanceOf(
        DownloaderUnavailableError,
      );
    });

    it('checkAvailability khi vắng downloader ⇒ {available:false}, KHÔNG ném', async () => {
      config.reup.pythonBin = undefined as unknown as string;

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('REUP_PYTHON_BIN');
    });

    it('checkAvailability khi downloader chạy được ⇒ {available:true, version}', async () => {
      scheduleProcess({
        stdout: JSON.stringify({ contractVersion: 1, ok: true, version: '1' }),
      });

      await expect(adapter.checkAvailability()).resolves.toEqual({
        available: true,
        version: '1',
      });
    });

    it('checkAvailability KHÔNG ném kể cả khi stdout là rác', async () => {
      scheduleProcess({ stdout: 'rác hoàn toàn' });

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(false);
    });
  });

  describe('download', () => {
    const downloadParams = {
      url: 'https://youtu.be/abc',
      outDir: '/tmp/reup/j1',
    };

    it('trả về filePath/fileSize/mimeType từ JSON', async () => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 1,
          ok: true,
          filePath: '/tmp/reup/j1/index.mp4',
          fileSize: 12_345_678,
          mimeType: 'video/mp4',
        }),
      });

      await expect(adapter.download(downloadParams)).resolves.toEqual({
        filePath: '/tmp/reup/j1/index.mp4',
        fileSize: 12_345_678,
        mimeType: 'video/mp4',
      });
    });

    it('download KHÔNG cần API key ⇒ không hỏi settings', async () => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 1,
          ok: true,
          filePath: '/tmp/x.mp4',
          fileSize: 1,
        }),
      });

      await adapter.download(downloadParams);

      expect(settings.getYoutubeApiKey).not.toHaveBeenCalled();
    });

    it('spawn với detached:true để giết được CẢ CÂY process (yt-dlp là cháu)', async () => {
      scheduleProcess({
        stdout: JSON.stringify({
          contractVersion: 1,
          ok: true,
          filePath: '/tmp/x.mp4',
          fileSize: 1,
        }),
      });

      await adapter.download(downloadParams);

      const [, , options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { detached: boolean; cwd: string },
      ];

      expect(options.detached).toBe(true);
      expect(options.cwd).toBe(REUP_CONFIG.projectDir);
    });

    it('quá timeout ⇒ giết process rồi ném TimeoutError', async () => {
      jest.useFakeTimers();
      config.reup.downloadTimeoutMs = 1_000;
      const child = scheduleProcess({ hang: true });
      const killSpy = jest
        .spyOn(process, 'kill')
        .mockImplementation(() => true);

      const promise = adapter.download(downloadParams);
      // Cho promise chain chạy tới chỗ gắn setTimeout rồi mới tua đồng hồ.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1_500);
      // Process thật sẽ đóng sau khi bị giết.
      child.emit('close', null);

      await expect(promise).rejects.toBeInstanceOf(DownloaderTimeoutError);
      // Dấu TRỪ = giết cả process group, không chỉ process con trực tiếp.
      expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');

      killSpy.mockRestore();
      jest.useRealTimers();
    });
  });
});
