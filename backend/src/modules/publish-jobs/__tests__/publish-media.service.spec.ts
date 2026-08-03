import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  MediaType,
  type ContentAsset,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../../infra/clock/clock.service';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type { DriveStorage } from '../../../infra/drive/drive-storage.interface';
import type { FacebookPublisherClient } from '../../../infra/facebook/facebook-publisher.client';
import type {
  PublishMediaInput,
  PublishResult,
} from '../../../infra/facebook/facebook-publisher.interface';
import { MediaCacheService } from '../../../infra/media-cache/media-cache.service';
import { PublishMediaService, buildMessage } from '../publish-media.service';

const NOW = new Date('2026-08-03T05:00:00Z');

const makeContent = (overrides: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: 'content-1',
    title: 'Video giới thiệu',
    caption: 'Caption gốc',
    hashtags: '#cay #canh',
    mediaType: MediaType.video,
    driveFileId: 'drive-video-1',
    mimeType: 'video/mp4',
    ...overrides,
  }) as ContentAsset;

describe('PublishMediaService', () => {
  let cacheDir: string;
  let storage: { createReadStream: jest.Mock<Promise<Readable>, [string]> };
  let driveFactory: { get: jest.Mock<Promise<DriveStorage>, []> };
  let publisher: {
    publishImage: jest.Mock<Promise<PublishResult>, [PublishMediaInput]>;
    publishVideo: jest.Mock<Promise<PublishResult>, [PublishMediaInput]>;
  };
  let service: PublishMediaService;

  const publishTo = (pageId: string): Promise<PublishResult> =>
    service.publish({
      content: makeContent(),
      pageId,
      accessToken: 'token',
      caption: 'Caption gốc',
      hashtags: '#cay #canh',
    });

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'publish-media-test-'));
    storage = { createReadStream: jest.fn<Promise<Readable>, [string]>() };
    storage.createReadStream.mockImplementation(() =>
      Promise.resolve(Readable.from([Buffer.from('nội-dung-video')])),
    );
    driveFactory = { get: jest.fn<Promise<DriveStorage>, []>() };
    driveFactory.get.mockResolvedValue(storage as unknown as DriveStorage);
    publisher = {
      publishImage: jest
        .fn<Promise<PublishResult>, [PublishMediaInput]>()
        .mockResolvedValue({ postId: 'photo-1' }),
      publishVideo: jest
        .fn<Promise<PublishResult>, [PublishMediaInput]>()
        .mockResolvedValue({ postId: 'video-1' }),
    };

    const clock: ClockService = { now: () => NOW };
    const mediaCache = new MediaCacheService(
      driveFactory as unknown as DriveStorageFactory,
      {
        mediaCache: { dir: cacheDir, ttlMs: 600_000 },
      } as unknown as AppConfigService,
      clock,
    );
    await mediaCache.onModuleInit();

    service = new PublishMediaService(
      mediaCache,
      publisher as unknown as FacebookPublisherClient,
    );
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe('publish', () => {
    it('CÙNG 1 VIDEO ĐĂNG LÊN 4 PAGE: chỉ tải từ Drive ĐÚNG 1 LẦN', async () => {
      await publishTo('page-1');
      await publishTo('page-2');
      await publishTo('page-3');
      await publishTo('page-4');

      expect(storage.createReadStream).toHaveBeenCalledTimes(1);
      expect(publisher.publishVideo).toHaveBeenCalledTimes(4);
    });

    it('gửi cho publisher ĐƯỜNG DẪN file, không phải Buffer trong RAM', async () => {
      await publishTo('page-1');

      const [input] = publisher.publishVideo.mock.calls[0];
      expect(typeof input.file.path).toBe('string');
      await expect(readFile(input.file.path, 'utf8')).resolves.toBe(
        'nội-dung-video',
      );
    });

    it('file vẫn còn trên đĩa trong suốt lúc publisher đang gửi', async () => {
      let existedDuringSend = false;
      publisher.publishVideo.mockImplementation(async (input) => {
        existedDuringSend =
          (await readFile(input.file.path, 'utf8')) === 'nội-dung-video';
        return { postId: 'video-1' };
      });

      await publishTo('page-1');

      expect(existedDuringSend).toBe(true);
    });

    it('bài video ⇒ publishVideo, đúng pageId và message đã ghép hashtag', async () => {
      await publishTo('page-9');

      const [input] = publisher.publishVideo.mock.calls[0];
      expect(input.pageId).toBe('page-9');
      expect(input.message).toBe('Caption gốc\n\n#cay #canh');
      expect(publisher.publishImage).not.toHaveBeenCalled();
    });

    it('bài ảnh ⇒ publishImage với mimeType và tên file theo content', async () => {
      await service.publish({
        content: makeContent({
          id: 'content-anh',
          mediaType: MediaType.image,
          mimeType: 'image/png',
          driveFileId: 'drive-anh',
        }),
        pageId: 'page-1',
        accessToken: 'token',
        caption: 'Chỉ caption',
        hashtags: null,
      });

      const [input] = publisher.publishImage.mock.calls[0];
      expect(input.file.filename).toBe('content-anh.png');
      expect(input.file.mimeType).toBe('image/png');
      expect(input.message).toBe('Chỉ caption');
    });

    it('mimeType null ⇒ suy ra từ mediaType, không gửi undefined lên Graph', async () => {
      await service.publish({
        content: makeContent({ mimeType: null }),
        pageId: 'page-1',
        accessToken: 'token',
        caption: 'Caption',
      });

      const [input] = publisher.publishVideo.mock.calls[0];
      expect(input.file.mimeType).toBe('video/mp4');
      expect(input.file.filename).toBe('content-1.mp4');
    });

    it('publisher ném lỗi ⇒ ném ra ngoài để executor ghi FAILED', async () => {
      publisher.publishVideo.mockRejectedValue(new Error('Graph 400'));

      await expect(publishTo('page-1')).rejects.toThrow('Graph 400');
    });

    it('publisher hỏng ở page đầu vẫn không làm hỏng cache cho page sau', async () => {
      publisher.publishVideo.mockRejectedValueOnce(new Error('Graph 400'));

      await publishTo('page-1').catch(() => undefined);
      await publishTo('page-2');

      expect(storage.createReadStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildMessage', () => {
    it('ghép hashtag xuống hai dòng dưới caption', () => {
      expect(buildMessage('Caption', '#a #b')).toBe('Caption\n\n#a #b');
    });

    it('hashtag rỗng hoặc null ⇒ chỉ caption', () => {
      expect(buildMessage('Caption', '   ')).toBe('Caption');
      expect(buildMessage('Caption', null)).toBe('Caption');
      expect(buildMessage('Caption')).toBe('Caption');
    });
  });
});
