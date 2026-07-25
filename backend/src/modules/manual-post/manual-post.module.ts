import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ContentAssetsModule } from '../content-assets/content-assets.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
import { PublishJobsModule } from '../publish-jobs/publish-jobs.module';
import { ManualPostController } from './manual-post.controller';
import { ManualPostRepository } from './manual-post.repository';
import { ManualPostService } from './manual-post.service';

/**
 * Đăng tay một bài lên một page, ngay lập tức. Cố tình tách khỏi engine tự động
 * (plan 07): ở đây không có cron, không có queue, user đứng chờ kết quả.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ContentAssetsModule,
    FacebookPagesModule,
    // Đăng tay dùng chung đường publish với Bot (PublishMediaService).
    PublishJobsModule,
  ],
  controllers: [ManualPostController],
  providers: [ManualPostRepository, ManualPostService],
})
export class ManualPostModule {}
