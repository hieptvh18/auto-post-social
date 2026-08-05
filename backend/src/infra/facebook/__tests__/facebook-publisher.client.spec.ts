import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfigService } from '../../../config/app-config.service';
import { FacebookPublisherClient } from '../facebook-publisher.client';
import { FacebookGraphError } from '../facebook.errors';
import type {
  PublishAlbumInput,
  PublishMediaInput,
} from '../facebook-publisher.interface';

const buildConfig = (videoChunkRetries = 3): AppConfigService =>
  ({
    facebook: {
      appId: undefined,
      appSecret: undefined,
      graphVersion: 'v21.0',
      imageTimeoutMs: 60_000,
      videoTimeoutMs: 900_000,
      videoChunkRetries,
    },
  }) as AppConfigService;

/** Response giả — chỉ cần `ok` và `json()` như client dùng. */
const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('FacebookPublisherClient', () => {
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
  let client: FacebookPublisherClient;
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    dir = mkdtempSync(join(tmpdir(), 'fb-publisher-test-'));
    filePath = join(dir, 'video.mp4');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const baseInput = (size: number): PublishMediaInput => {
    writeFileSync(filePath, Buffer.alloc(size, 'a'));
    return {
      pageId: 'page-1',
      accessToken: 'tok',
      message: 'nội dung bài đăng',
      file: {
        path: filePath,
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size,
      },
    };
  };

  /** Ghi file với nội dung phân biệt từng byte, để test chunk không làm hỏng dữ liệu. */
  const inputWithBytes = (bytes: Buffer): PublishMediaInput => {
    writeFileSync(filePath, bytes);
    return {
      pageId: 'page-1',
      accessToken: 'tok',
      message: 'nội dung bài đăng',
      file: {
        path: filePath,
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: bytes.length,
      },
    };
  };

  describe('publishImage', () => {
    it('POST 1 lần tới /photos, lấy post_id', async () => {
      writeFileSync(filePath, Buffer.alloc(10, 'a'));
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: 'photo-1', post_id: 'post-1' }),
      );
      client = new FacebookPublisherClient(buildConfig());

      const result = await client.publishImage({
        pageId: 'page-1',
        accessToken: 'tok',
        message: 'caption',
        file: {
          path: filePath,
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 10,
        },
      });

      expect(result).toEqual({ postId: 'post-1' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/page-1/photos');
    });
  });

  describe('publishImageAlbum — nhiều ảnh một bài', () => {
    /** Mượn file giả: mọi ảnh dùng chung một file trên đĩa, khác nhau ở tên. */
    const albumInput = (count: number): PublishAlbumInput => {
      writeFileSync(filePath, Buffer.alloc(10, 'a'));
      return {
        pageId: 'page-1',
        accessToken: 'tok',
        message: 'caption chung',
        files: {
          count,
          withFile: (index, fn) =>
            fn({
              path: filePath,
              filename: `anh-${index}.jpg`,
              mimeType: 'image/jpeg',
              size: 10,
            }),
        },
      };
    };

    it('upload từng ảnh published=false rồi tạo 1 bài feed kèm attached_media', async () => {
      client = new FacebookPublisherClient(buildConfig());
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'photo-1' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'photo-2' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'photo-3' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'post-1' }));

      const result = await client.publishImageAlbum(albumInput(3));

      expect(result).toEqual({ postId: 'post-1' });
      // 3 lần /photos + đúng 1 lần /feed — không phải 3 bài riêng lẻ.
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const urls = fetchMock.mock.calls.map((call) => call[0]);
      expect(urls.slice(0, 3).every((url) => url.includes('/photos'))).toBe(
        true,
      );
      expect(urls[3]).toContain('/page-1/feed');

      const photoForm = fetchMock.mock.calls[0][1].body as FormData;
      expect(photoForm.get('published')).toBe('false');

      const feedForm = fetchMock.mock.calls[3][1].body as FormData;
      expect(feedForm.get('message')).toBe('caption chung');
      expect(feedForm.get('attached_media[0]')).toBe(
        JSON.stringify({ media_fbid: 'photo-1' }),
      );
      expect(feedForm.get('attached_media[2]')).toBe(
        JSON.stringify({ media_fbid: 'photo-3' }),
      );
    });

    it('một ảnh upload lỗi ⇒ dừng luôn, KHÔNG tạo bài feed cụt', async () => {
      client = new FacebookPublisherClient(buildConfig());
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'photo-1' }))
        .mockResolvedValueOnce(
          jsonResponse(400, { error: { message: 'Ảnh hỏng' } }),
        );

      await expect(client.publishImageAlbum(albumInput(3))).rejects.toThrow(
        FacebookGraphError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('ảnh trả về không có id ⇒ FacebookGraphError, không đăng bài', async () => {
      client = new FacebookPublisherClient(buildConfig());
      fetchMock.mockResolvedValue(jsonResponse(200, {}));

      await expect(client.publishImageAlbum(albumInput(2))).rejects.toThrow(
        FacebookGraphError,
      );
    });
  });

  describe('publishVideo — resumable upload', () => {
    it('1 chunk: start → transfer → finish, postId = video_id của start', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig());

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: '0',
            end_offset: '5',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: '5', end_offset: '5' }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: true }));

      const result = await client.publishVideo(input);

      expect(result).toEqual({ postId: 'vid-1' });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const [startUrl, startInit] = fetchMock.mock.calls[0];
      expect(startUrl).toContain('graph-video.facebook.com');
      expect(startUrl).toContain('/page-1/videos');
      expect((startInit.body as FormData).get('upload_phase')).toBe('start');
      expect((startInit.body as FormData).get('file_size')).toBe('5');

      const [, transferInit] = fetchMock.mock.calls[1];
      const transferForm = transferInit.body as FormData;
      expect(transferForm.get('upload_phase')).toBe('transfer');
      expect(transferForm.get('upload_session_id')).toBe('sess-1');
      expect(transferForm.get('start_offset')).toBe('0');

      const [, finishInit] = fetchMock.mock.calls[2];
      const finishForm = finishInit.body as FormData;
      expect(finishForm.get('upload_phase')).toBe('finish');
      expect(finishForm.get('upload_session_id')).toBe('sess-1');
      expect(finishForm.get('description')).toBe('nội dung bài đăng');
    });

    it('nhiều chunk: lặp transfer tới khi start_offset === end_offset', async () => {
      const input = baseInput(10);
      client = new FacebookPublisherClient(buildConfig());

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 5,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 5, end_offset: 10 }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 10, end_offset: 10 }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: true }));

      const result = await client.publishVideo(input);

      expect(result).toEqual({ postId: 'vid-1' });
      // start + 2 transfer + finish
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const firstTransferOffset = (
        fetchMock.mock.calls[1][1].body as FormData
      ).get('start_offset');
      const secondTransferOffset = (
        fetchMock.mock.calls[2][1].body as FormData
      ).get('start_offset');
      expect(firstTransferOffset).toBe('0');
      expect(secondTransferOffset).toBe('5');
    });

    it('chia nhiều chunk không làm hỏng video — ghép byte gửi lên đúng 100% file gốc', async () => {
      // 12 byte phân biệt (0..11) — sai thứ tự/lệch offset/lặp byte đều lộ ra ngay.
      const original = Buffer.from(Array.from({ length: 12 }, (_, i) => i));
      const input = inputWithBytes(original);
      client = new FacebookPublisherClient(buildConfig());

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 4,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 4, end_offset: 9 }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 9, end_offset: 12 }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 12, end_offset: 12 }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: true }));

      await client.publishVideo(input);

      // 3 lần transfer (call index 1, 2, 3 — call 0 là start, call 4 là finish).
      const chunks: Buffer[] = [];
      for (const call of fetchMock.mock.calls.slice(1, 4)) {
        const form = call[1].body as FormData;
        const blob = form.get('video_file_chunk') as Blob;
        chunks.push(Buffer.from(await blob.arrayBuffer()));
      }

      expect(Buffer.concat(chunks)).toEqual(original);
    });

    it('start lỗi Graph ⇒ FacebookGraphError, thử lại đúng số lần cấu hình', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig(2));

      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { message: 'Invalid token', code: 190 } }),
      );

      await expect(client.publishVideo(input)).rejects.toThrow(
        FacebookGraphError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('transfer lỗi mạng rồi retry thành công', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig(2));

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 5,
          }),
        )
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 5, end_offset: 5 }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: true }));

      const result = await client.publishVideo(input);

      expect(result).toEqual({ postId: 'vid-1' });
      // start + transfer(fail) + transfer(retry ok) + finish
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('transfer hết lượt retry vẫn lỗi ⇒ FacebookGraphError, không gọi finish', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig(2));

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 5,
          }),
        )
        .mockRejectedValue(new Error('socket hang up'));

      await expect(client.publishVideo(input)).rejects.toThrow(
        FacebookGraphError,
      );
      // start + 2 lần thử transfer, không có finish
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('finish trả success:false ⇒ FacebookGraphError', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig(1));

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 5,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 5, end_offset: 5 }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: false }));

      await expect(client.publishVideo(input)).rejects.toThrow(
        FacebookGraphError,
      );
    });

    it('offset không tiến ⇒ dừng ngay, không lặp vô hạn', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig());

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            video_id: 'vid-1',
            upload_session_id: 'sess-1',
            start_offset: 0,
            end_offset: 5,
          }),
        )
        // Facebook trả lại đúng offset cũ — không tiến.
        .mockResolvedValueOnce(
          jsonResponse(200, { start_offset: 0, end_offset: 5 }),
        );

      await expect(client.publishVideo(input)).rejects.toThrow(
        /offset không hợp lệ/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('start thiếu video_id ⇒ FacebookGraphError', async () => {
      const input = baseInput(5);
      client = new FacebookPublisherClient(buildConfig(1));

      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          upload_session_id: 'sess-1',
          start_offset: 0,
          end_offset: 5,
        }),
      );

      await expect(client.publishVideo(input)).rejects.toThrow(
        FacebookGraphError,
      );
    });
  });
});
