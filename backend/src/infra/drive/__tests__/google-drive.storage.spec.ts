import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { DriveAuthExpiredError, DriveFileError } from '../drive.errors';
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
      createDriveClient({
        mode: 'service_account',
        serviceAccountJson: SA_JSON,
      }),
    ).toBeDefined();
  });

  it('ném lỗi khi service account JSON không parse được', () => {
    expect(() =>
      createDriveClient({
        mode: 'service_account',
        serviceAccountJson: 'not-json',
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('dựng được client OAuth2 từ clientId/secret/refreshToken', () => {
    expect(
      createDriveClient({
        mode: 'oauth2',
        clientId: 'cid',
        clientSecret: 'csecret',
        refreshToken: 'rtoken',
      }),
    ).toBeDefined();
  });
});

describe('GoogleDriveStorage', () => {
  let files: {
    create: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
    copy: jest.Mock;
  };
  let storage: GoogleDriveStorage;

  beforeEach(() => {
    files = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      copy: jest.fn(),
    };
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
          supportsAllDrives: true,
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

    it('403 accessNotConfigured => message báo chưa bật Drive API', async () => {
      files.create.mockRejectedValue({
        code: 403,
        errors: [{ reason: 'accessNotConfigured' }],
      });

      await expect(storage.upload(INPUT)).rejects.toThrow(
        /chưa được bật|Drive API/i,
      );
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

    it('invalid_grant trong response.data => DriveAuthExpiredError', async () => {
      files.create.mockRejectedValue({
        code: 400,
        message: 'Bad Request',
        response: { data: { error: 'invalid_grant' } },
      });

      await expect(storage.upload(INPUT)).rejects.toThrow(
        DriveAuthExpiredError,
      );
    });

    it('invalid_grant chỉ nằm trong message => vẫn nhận diện được', async () => {
      files.create.mockRejectedValue({ message: 'invalid_grant' });

      await expect(storage.upload(INPUT)).rejects.toThrow(
        /kết nối lại|Kết nối Google/i,
      );
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
        { fileId: 'drive-1', alt: 'media', supportsAllDrives: true },
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

  describe('getMetadata', () => {
    it('chỉ xin đúng field cần, không tải nội dung file', async () => {
      files.get.mockResolvedValue({
        data: {
          id: 'src-1',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: '2048',
          capabilities: { canCopy: true },
        },
      });

      const meta = await storage.getMetadata('src-1');

      expect(files.get).toHaveBeenCalledWith({
        fileId: 'src-1',
        fields:
          'id, name, mimeType, size, capabilities/canCopy, shortcutDetails/targetId',
        supportsAllDrives: true,
      });
      expect(meta).toEqual({
        fileId: 'src-1',
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 2048,
        canCopy: true,
        shortcutTargetId: null,
      });
    });

    it('canCopy = false khi chủ file tắt quyền sao chép', async () => {
      files.get.mockResolvedValue({
        data: { id: 'src-1', capabilities: { canCopy: false } },
      });

      await expect(storage.getMetadata('src-1')).resolves.toMatchObject({
        canCopy: false,
      });
    });

    it('thiếu capabilities ⇒ coi như copy được (để Drive tự từ chối, không chặn nhầm)', async () => {
      files.get.mockResolvedValue({ data: { id: 'src-1' } });

      await expect(storage.getMetadata('src-1')).resolves.toMatchObject({
        canCopy: true,
      });
    });

    it('file Google Docs không có size ⇒ null, không phải 0', async () => {
      files.get.mockResolvedValue({
        data: { id: 'src-1', mimeType: 'application/vnd.google-apps.document' },
      });

      await expect(storage.getMetadata('src-1')).resolves.toMatchObject({
        size: null,
      });
    });

    it('shortcut trả targetId để tầng trên đọc tiếp file đích', async () => {
      files.get.mockResolvedValue({
        data: {
          id: 'src-1',
          mimeType: 'application/vnd.google-apps.shortcut',
          shortcutDetails: { targetId: 'real-1' },
        },
      });

      await expect(storage.getMetadata('src-1')).resolves.toMatchObject({
        shortcutTargetId: 'real-1',
      });
    });

    it('404/403 ⇒ DriveFileError NOT_FOUND_OR_NO_ACCESS (để UI hiện đúng gợi ý)', async () => {
      files.get.mockRejectedValue({ code: 404 });

      await expect(storage.getMetadata('src-1')).rejects.toMatchObject({
        code: 'NOT_FOUND_OR_NO_ACCESS',
      });
    });
  });

  describe('copy', () => {
    it('copy phía Google vào folder cấu hình — KHÔNG tải file về server', async () => {
      files.copy.mockResolvedValue({
        data: {
          id: 'copy-1',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: '2048',
          webViewLink: 'https://drive/copy-1',
          thumbnailLink: null,
        },
      });

      const result = await storage.copy('src-1', 'clip.mp4');

      expect(files.copy).toHaveBeenCalledWith({
        fileId: 'src-1',
        requestBody: { name: 'clip.mp4', parents: [FOLDER] },
        fields: 'id, name, mimeType, size, thumbnailLink, webViewLink',
        supportsAllDrives: true,
      });
      // Không đụng tới files.get (alt=media) ⇒ không byte nào qua backend.
      expect(files.get).not.toHaveBeenCalled();
      expect(result.fileId).toBe('copy-1');
    });

    it('Drive không trả id ⇒ lỗi rõ ràng thay vì tạo bài trỏ vào hư không', async () => {
      files.copy.mockResolvedValue({ data: {} });

      await expect(storage.copy('src-1')).rejects.toBeInstanceOf(
        DriveFileError,
      );
    });

    it('chủ file chặn sao chép ⇒ mã COPY_DISABLED', async () => {
      files.copy.mockRejectedValue({
        code: 403,
        errors: [{ reason: 'cannotCopyFile' }],
      });

      await expect(storage.copy('src-1')).rejects.toMatchObject({
        code: 'COPY_DISABLED',
      });
    });

    it('Drive đích hết dung lượng ⇒ mã QUOTA_EXCEEDED', async () => {
      files.copy.mockRejectedValue({
        code: 403,
        errors: [{ reason: 'storageQuotaExceeded' }],
      });

      await expect(storage.copy('src-1')).rejects.toMatchObject({
        code: 'QUOTA_EXCEEDED',
      });
    });

    it('bị chặn tốc độ ⇒ mã RATE_LIMITED', async () => {
      files.copy.mockRejectedValue({ code: 429 });

      await expect(storage.copy('src-1')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });

    it('refresh token chết vẫn là DriveAuthExpiredError để factory xoá token', async () => {
      files.copy.mockRejectedValue({
        response: { data: { error: 'invalid_grant' } },
      });

      await expect(storage.copy('src-1')).rejects.toBeInstanceOf(
        DriveAuthExpiredError,
      );
    });
  });

  describe('delete', () => {
    it('gọi files.delete đúng fileId', async () => {
      files.delete.mockResolvedValue({});

      await storage.delete('drive-1');

      expect(files.delete).toHaveBeenCalledWith({
        fileId: 'drive-1',
        supportsAllDrives: true,
      });
    });

    it('lỗi Drive => domain error', async () => {
      files.delete.mockRejectedValue({ code: 403 });

      await expect(storage.delete('drive-1')).rejects.toThrow(
        BadGatewayException,
      );
    });
  });
});
