import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { createDriveClient, GoogleDriveStorage } from '../google-drive.storage';

const FOLDER = 'folder-1';
const SA_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam',
  private_key: 'key',
});

const INPUT = {
  filename: 'clip.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('bytes'),
};

describe('createDriveClient', () => {
  it('dựng được client từ service account JSON hợp lệ', () => {
    expect(
      createDriveClient({ serviceAccountJson: SA_JSON, folderId: FOLDER }),
    ).toBeDefined();
  });

  it('ném lỗi khi service account JSON không parse được', () => {
    expect(() =>
      createDriveClient({ serviceAccountJson: 'not-json', folderId: FOLDER }),
    ).toThrow(InternalServerErrorException);
  });
});

describe('GoogleDriveStorage', () => {
  let files: { create: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let storage: GoogleDriveStorage;

  beforeEach(() => {
    files = { create: jest.fn(), get: jest.fn(), delete: jest.fn() };
    storage = new GoogleDriveStorage(
      { files } as unknown as drive_v3.Drive,
      FOLDER,
    );
  });

  describe('upload', () => {
    it('upload vào đúng folder và map metadata trả về', async () => {
      files.create.mockResolvedValue({
        data: {
          id: 'drive-1',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: '2048',
          webViewLink: 'https://view',
          thumbnailLink: 'https://thumb',
        },
      });

      const result = await storage.upload(INPUT);

      expect(files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { name: 'clip.mp4', parents: [FOLDER] },
        }),
      );
      expect(result).toEqual({
        fileId: 'drive-1',
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 2048,
        webViewLink: 'https://view',
        thumbnailLink: 'https://thumb',
      });
    });

    it('dùng giá trị input khi Drive không trả đủ metadata', async () => {
      files.create.mockResolvedValue({ data: { id: 'drive-1' } });

      const result = await storage.upload(INPUT);

      expect(result).toEqual({
        fileId: 'drive-1',
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 5,
        webViewLink: null,
        thumbnailLink: null,
      });
    });

    it('ném lỗi khi Drive không trả fileId', async () => {
      files.create.mockResolvedValue({ data: { id: null } });

      await expect(storage.upload(INPUT)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('lỗi 403 => message hướng dẫn share folder', async () => {
      files.create.mockRejectedValue({ code: 403, message: 'forbidden' });

      await expect(storage.upload(INPUT)).rejects.toThrow(/share folder/i);
    });

    it('lỗi 404 => message hướng dẫn kiểm tra Folder ID', async () => {
      files.create.mockRejectedValue({ code: 404, message: 'not found' });

      await expect(storage.upload(INPUT)).rejects.toThrow(/Folder ID/);
    });

    it('quota exceeded => BadGateway nói rõ hết dung lượng', async () => {
      files.create.mockRejectedValue({
        code: 403,
        errors: [{ reason: 'storageQuotaExceeded' }],
      });

      await expect(storage.upload(INPUT)).rejects.toThrow(/quota|dung lượng/i);
    });

    it('quotaExceeded (reason ngắn) cũng được nhận diện', async () => {
      files.create.mockRejectedValue({
        code: 403,
        errors: [{ reason: 'quotaExceeded' }],
      });

      await expect(storage.upload(INPUT)).rejects.toThrow(BadGatewayException);
    });

    it('lỗi lạ => InternalServerError kèm message gốc', async () => {
      files.create.mockRejectedValue({ code: 500, message: 'boom' });

      await expect(storage.upload(INPUT)).rejects.toThrow(/boom/);
    });

    it('lỗi không phải object => vẫn wrap thành domain error', async () => {
      files.create.mockRejectedValue('string error');

      await expect(storage.upload(INPUT)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('createReadStream', () => {
    it('trả stream từ Drive, không buffer', async () => {
      const stream = Readable.from(['chunk']);
      files.get.mockResolvedValue({ data: stream });

      const result = await storage.createReadStream('drive-1');

      expect(files.get).toHaveBeenCalledWith(
        { fileId: 'drive-1', alt: 'media' },
        { responseType: 'stream' },
      );
      expect(result).toBe(stream);
    });

    it('lỗi Drive => domain error', async () => {
      files.get.mockRejectedValue({ code: 404 });

      await expect(storage.createReadStream('drive-1')).rejects.toThrow(
        BadGatewayException,
      );
    });
  });

  describe('delete', () => {
    it('gọi files.delete đúng fileId', async () => {
      files.delete.mockResolvedValue({});

      await storage.delete('drive-1');

      expect(files.delete).toHaveBeenCalledWith({ fileId: 'drive-1' });
    });

    it('lỗi Drive => domain error', async () => {
      files.delete.mockRejectedValue({ code: 403 });

      await expect(storage.delete('drive-1')).rejects.toThrow(
        BadGatewayException,
      );
    });
  });
});
