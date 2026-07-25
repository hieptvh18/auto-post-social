import { Module } from '@nestjs/common';
import { DriveModule } from '../../infra/drive/drive.module';
import { FacebookModule } from '../../infra/facebook/facebook.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ContentAssetsModule } from '../content-assets/content-assets.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
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
    DriveModule,
    FacebookModule,
    AuditModule,
    ContentAssetsModule,
    FacebookPagesModule,
  ],
  controllers: [ManualPostController],
  providers: [ManualPostRepository, ManualPostService],
})
export class ManualPostModule {}
