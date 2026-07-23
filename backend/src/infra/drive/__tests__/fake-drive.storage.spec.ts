import { NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { FakeDriveStorage } from '../fake-drive.storage';

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

describe('FakeDriveStorage', () => {
  let baseDir: string;
  let storage: FakeDriveStorage;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'fake-drive-'));
    storage = new FakeDriveStorage(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('trả về metadata với fileId sinh mới', async () => {
      const result = await storage.upload({
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('video-bytes'),
      });

      expect(result.fileId).toMatch(/^fake-/);
      expect(result.name).toBe('clip.mp4');
      expect(result.mimeType).toBe('video/mp4');
      expect(result.size).toBe(11);
      expect(result.thumbnailLink).toBeNull();
      expect(result.webViewLink).toContain(result.fileId);
    });

    it('dùng thư mục mặc định khi không truyền baseDir', () => {
      expect(new FakeDriveStorage()).toBeInstanceOf(FakeDriveStorage);
    });
  });

  describe('createReadStream', () => {
    it('đọc lại đúng nội dung đã upload (round-trip)', async () => {
      const content = Buffer.from('noi dung goc');
      const { fileId } = await storage.upload({
        filename: 'a.mp4',
        mimeType: 'video/mp4',
        buffer: content,
      });

      const stream = await storage.createReadStream(fileId);

      expect(await readAll(stream)).toEqual(content);
    });

    it('ném NotFound khi fileId không tồn tại', async () => {
      await expect(storage.createReadStream('fake-khong-co')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('xoá file khiến không đọc lại được nữa', async () => {
      const { fileId } = await storage.upload({
        filename: 'a.png',
        mimeType: 'image/png',
        buffer: Buffer.from('x'),
      });

      await storage.delete(fileId);

      await expect(storage.createReadStream(fileId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('xoá file không tồn tại vẫn thành công (idempotent)', async () => {
      await expect(storage.delete('fake-khong-co')).resolves.toBeUndefined();
    });
  });
});
