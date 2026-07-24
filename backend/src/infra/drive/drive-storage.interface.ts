import type { Readable } from 'node:stream';

export interface UploadFileInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string | null;
  thumbnailLink: string | null;
}

/** Cổng ra Google Drive thật (service account hoặc OAuth2). */
export interface DriveStorage {
  upload(file: UploadFileInput): Promise<DriveFile>;
  createReadStream(fileId: string): Promise<Readable>;
  delete(fileId: string): Promise<void>;
}
