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

/**
 * Cổng ra Google Drive. Có driver `real` và `fake` (ADR-003) để chạy local
 * không cần credential thật.
 */
export interface DriveStorage {
  upload(file: UploadFileInput): Promise<DriveFile>;
  createReadStream(fileId: string): Promise<Readable>;
  delete(fileId: string): Promise<void>;
}
