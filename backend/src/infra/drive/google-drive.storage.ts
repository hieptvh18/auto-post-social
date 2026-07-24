import { InternalServerErrorException } from '@nestjs/common';
import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import type {
  DriveFile,
  DriveStorage,
  UploadFileInput,
} from './drive-storage.interface';
import { mapDriveError } from './drive.errors';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const FILE_FIELDS = 'id, name, mimeType, size, thumbnailLink, webViewLink';

/** Xác thực bằng service account JSON (chỉ ghi được vào Shared Drive). */
export interface ServiceAccountAuth {
  mode: 'service_account';
  serviceAccountJson: string;
}

/** Xác thực OAuth2 theo tài khoản user (Gmail free dùng được). */
export interface OAuth2Auth {
  mode: 'oauth2';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type DriveAuthOptions = ServiceAccountAuth | OAuth2Auth;

/** Tách ra để test inject được client giả mà không phải mock cả googleapis. */
export function createDriveClient(options: DriveAuthOptions): drive_v3.Drive {
  if (options.mode === 'oauth2') {
    const oauth = new google.auth.OAuth2(
      options.clientId,
      options.clientSecret,
    );
    oauth.setCredentials({ refresh_token: options.refreshToken });
    return google.drive({ version: 'v3', auth: oauth });
  }

  let credentials: unknown;
  try {
    credentials = JSON.parse(options.serviceAccountJson);
  } catch {
    throw new InternalServerErrorException(
      'Service Account JSON không hợp lệ — vào Cài đặt chung để nhập lại.',
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials as Record<string, string>,
    scopes: DRIVE_SCOPES,
  });

  return google.drive({ version: 'v3', auth });
}

/** Driver `real`: upload/stream trực tiếp trên Google Drive. */
export class GoogleDriveStorage implements DriveStorage {
  constructor(
    private readonly drive: drive_v3.Drive,
    private readonly folderId: string,
  ) {}

  async upload(file: UploadFileInput): Promise<DriveFile> {
    try {
      const res = await this.drive.files.create({
        requestBody: { name: file.filename, parents: [this.folderId] },
        media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
        fields: FILE_FIELDS,
        // Cho phép ghi vào Shared Drive (service account chỉ ghi được ở đây).
        supportsAllDrives: true,
      });

      const data = res.data;
      if (data.id === null || data.id === undefined) {
        throw new InternalServerErrorException(
          'Google Drive không trả về fileId sau khi upload',
        );
      }

      return {
        fileId: data.id,
        name: data.name ?? file.filename,
        mimeType: data.mimeType ?? file.mimeType,
        // Drive trả size dạng string; thiếu thì lấy độ dài buffer đã upload.
        size:
          data.size === null || data.size === undefined
            ? file.buffer.length
            : Number(data.size),
        webViewLink: data.webViewLink ?? null,
        thumbnailLink: data.thumbnailLink ?? null,
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      mapDriveError(error, 'upload file');
    }
  }

  /** Stream, KHÔNG buffer — video lớn sẽ OOM nếu nạp hết vào RAM. */
  async createReadStream(fileId: string): Promise<Readable> {
    try {
      const res = await this.drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      );
      return res.data;
    } catch (error) {
      mapDriveError(error, `đọc file ${fileId}`);
    }
  }

  async delete(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId, supportsAllDrives: true });
    } catch (error) {
      mapDriveError(error, `xoá file ${fileId}`);
    }
  }
}
