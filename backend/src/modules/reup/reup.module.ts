import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module';
import { ClockModule } from '../../infra/clock/clock.module';
import { DriveModule } from '../../infra/drive/drive.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ReupDownloaderModule } from '../../infra/reup-downloader/reup-downloader.module';
import { AuditModule } from '../audit/audit.module';
import { MediaUploadJobsModule } from '../media-upload-jobs/media-upload-jobs.module';
import { MEDIA_UPLOAD_QUEUE } from '../media-upload-jobs/media-upload.constants';
import { SettingsModule } from '../settings/settings.module';
import { ReupCleanupController } from './reup-cleanup.controller';
import { ReupCleanupRepository } from './reup-cleanup.repository';
import { ReupCleanupService } from './reup-cleanup.service';
import { ReupDebugService } from './reup-debug.service';
import { ReupDiscoveryService } from './reup-discovery.service';
import { ReupScheduleController } from './reup-schedule.controller';
import { ReupScheduleService } from './reup-schedule.service';
import { ReupDownloadProcessor } from './reup-download.processor';
import { ReupDownloadService } from './reup-download.service';
import { ReupDownloaderController } from './reup-downloader.controller';
import { ReupRunsRepository } from './reup-runs.repository';
import { ReupTopicsController } from './reup-topics.controller';
import { ReupTopicsRepository } from './reup-topics.repository';
import { ReupTopicsService } from './reup-topics.service';
import { ReupVideosController } from './reup-videos.controller';
import { ReupVideosRepository } from './reup-videos.repository';
import { ReupVideosService } from './reup-videos.service';
import { REUP_DOWNLOAD_QUEUE } from './reup.constants';

/**
 * Menu Reup Setting — chỉ SUPER_ADMIN (`reup:*`, plan 26).
 *
 * QĐ-6: module này là **phụ thuộc tuỳ chọn** của hệ thống. Không module nào
 * ngoài đây được import `ReupDownloaderPort`; kho nội dung, auto-post, publish,
 * dashboard, audit đều không biết downloader tồn tại.
 *
 * Chiều phụ thuộc một hướng: `reup` → `media-upload-jobs` (QĐ-3, dùng lại ống
 * đẩy Drive có sẵn). Chiều ngược lại đi qua `MediaUploadCompletionHook` đăng ký
 * ở `ReupMediaHookModule` — xem `reup-media.hook.ts`.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AppConfigModule,
    ClockModule,
    SettingsModule,
    // Module DUY NHẤT được phép import cổng downloader (QĐ-6 §3).
    ReupDownloaderModule,
    // Dùng lại repository + hàng đợi upload có sẵn thay vì viết ống thứ hai.
    MediaUploadJobsModule,
    // Plan 30: cron dọn dẹp xoá file trên Drive của bài reup đã đăng quá hạn.
    DriveModule,
    BullModule.registerQueue(
      { name: REUP_DOWNLOAD_QUEUE },
      // Đăng ký lại để inject được `Queue` của media-upload ở `ReupDownloadService`.
      { name: MEDIA_UPLOAD_QUEUE },
    ),
  ],
  controllers: [
    ReupTopicsController,
    ReupDownloaderController,
    ReupVideosController,
    ReupCleanupController,
    ReupScheduleController,
  ],
  providers: [
    ReupTopicsRepository,
    ReupVideosRepository,
    ReupRunsRepository,
    ReupTopicsService,
    ReupVideosService,
    ReupDebugService,
    ReupDiscoveryService,
    ReupDownloadService,
    ReupDownloadProcessor,
    ReupCleanupRepository,
    ReupCleanupService,
    ReupScheduleService,
  ],
  exports: [ReupTopicsRepository, ReupTopicsService, ReupVideosRepository],
})
export class ReupModule {}
