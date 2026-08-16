import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module';
import { SettingsModule } from '../../modules/settings/settings.module';
import { PythonReupAdapter } from './python-reup.adapter';
import { REUP_DOWNLOADER } from './reup-downloader.interface';

/**
 * Cổng ra tới `ai-video-downloader` (plan 28).
 *
 * **KHÔNG kiểm tra gì lúc khởi động** (QĐ-6, cạm bẫy C10): không đọc file, không
 * spawn thử, không validate env. Máy chưa cài downloader vẫn boot bình thường —
 * mọi phát hiện xảy ra lúc adapter thực sự được gọi.
 *
 * Chỉ `modules/reup` được import module này.
 */
@Module({
  imports: [AppConfigModule, SettingsModule],
  providers: [{ provide: REUP_DOWNLOADER, useClass: PythonReupAdapter }],
  exports: [REUP_DOWNLOADER],
})
export class ReupDownloaderModule {}
