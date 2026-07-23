import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type {
  DriveFile,
  DriveStorage,
  UploadFileInput,
} from './drive-storage.interface';

export const FAKE_DRIVE_DIR = '.tmp-drive';

/**
 * Driver `fake` (ADR-003): ghi ra thư mục tạm local, không gọi mạng.
 * Dùng khi dev/test không có credential thật.
 */
export class FakeDriveStorage implements DriveStorage {
  constructor(private readonly baseDir: string = FAKE_DRIVE_DIR) {}

  async upload(file: UploadFileInput): Promise<DriveFile> {
    await mkdir(this.baseDir, { recursive: true });

    const fileId = `fake-${randomUUID()}`;
    await writeFile(this.pathOf(fileId), file.buffer);

    return {
      fileId,
      name: file.filename,
      mimeType: file.mimeType,
      size: file.buffer.length,
      webViewLink: `file://${this.pathOf(fileId)}`,
      thumbnailLink: null,
    };
  }

  // Trả Promise (dù không có await) để lỗi thành rejected promise, đồng nhất với driver real.
  createReadStream(fileId: string): Promise<Readable> {
    const path = this.pathOf(fileId);
    if (!existsSync(path)) {
      return Promise.reject(
        new NotFoundException(`Không tìm thấy file ${fileId} (fake drive)`),
      );
    }
    return Promise.resolve(createReadStream(path));
  }

  async delete(fileId: string): Promise<void> {
    const path = this.pathOf(fileId);
    // Xoá file không tồn tại coi như đã xoá — idempotent, không ném lỗi.
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  private pathOf(fileId: string): string {
    return join(this.baseDir, fileId);
  }
}
