import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { ClockModule } from '../../infra/clock/clock.module';
import { DriveModule } from '../../infra/drive/drive.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ContentAssetsModule } from '../content-assets/content-assets.module';
import { SettingsModule } from '../settings/settings.module';
import { DriveImportProcessor } from './drive-import.processor';
import { DriveImportsController } from './drive-imports.controller';
import { DriveImportsService } from './drive-imports.service';
import { MediaUploadJobsController } from './media-upload-jobs.controller';
import { MediaUploadJobsRepository } from './media-upload-jobs.repository';
import { MediaUploadJobsService } from './media-upload-jobs.service';
import { MediaUploadLimitGuard } from './media-upload-limit.guard';
import { MediaUploadProcessor } from './media-upload.processor';
import {
  DRIVE_IMPORT_QUEUE,
  MEDIA_UPLOAD_QUEUE,
} from './media-upload.constants';

/**
 * Upload media qua hàng đợi (plan 23): request chỉ nhận file xuống đĩa rồi trả
 * 202; worker `media-upload` đẩy lên Drive và tạo `content_assets` sau đó.
 *
 * `MulterModule` khai ở đây (không phải trong decorator) để `diskStorage` đọc
 * được `MEDIA_UPLOAD_TMP_DIR` từ DI — `FilesInterceptor` trong module này tự lấy
 * cấu hình đó làm mặc định. `MediaModule` vẫn giữ `memoryStorage()` riêng.
 */
@Module({
  imports: [
    PrismaModule,
    DriveModule,
    ClockModule,
    SettingsModule,
    ContentAssetsModule,
    BullModule.registerQueue(
      { name: MEDIA_UPLOAD_QUEUE },
      // Queue riêng cho nhập-từ-link: 2 loại việc không giành slot của nhau
      // (plan 24 §3.5).
      { name: DRIVE_IMPORT_QUEUE },
    ),
    MulterModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const dir = config.mediaUpload.tmpDir;
            mkdir(dir, { recursive: true }).then(
              () => cb(null, dir),
              (error: Error) => cb(error, dir),
            );
          },
          // Tên ngẫu nhiên: tên gốc (có dấu, có khoảng trắng, có thể trùng) chỉ
          // được giữ trong DB, không dùng làm đường dẫn.
          filename: (_req, file, cb) =>
            cb(null, `${randomUUID()}${extname(file.originalname)}`),
        }),
      }),
    }),
  ],
  controllers: [MediaUploadJobsController, DriveImportsController],
  providers: [
    MediaUploadJobsRepository,
    MediaUploadJobsService,
    MediaUploadLimitGuard,
    MediaUploadProcessor,
    DriveImportsService,
    DriveImportProcessor,
  ],
  // `MediaUploadJobsRepository` xuất ra cho module `reup` tạo job upload cho
  // video vừa tải (plan 29, QĐ-3 — dùng lại ống có sẵn, không viết ống thứ hai).
  // Chỉ là mở cửa đọc/ghi bảng; không đổi hành vi nào của luồng upload tay.
  exports: [
    MediaUploadJobsService,
    DriveImportsService,
    MediaUploadJobsRepository,
  ],
})
export class MediaUploadJobsModule {}
