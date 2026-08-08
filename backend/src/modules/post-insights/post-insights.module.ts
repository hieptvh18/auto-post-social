import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { FacebookModule } from '../../infra/facebook/facebook.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
import { InsightsSyncService } from './insights-sync.service';
import { PostInsightsController } from './post-insights.controller';
import { PostInsightsRepository } from './post-insights.repository';
import { PostInsightsService } from './post-insights.service';

/**
 * Thống kê lượt xem bài đã đăng (plan 25). Mượn `FacebookPagesRepository` để
 * kiểm page tồn tại thay vì tự query `facebook_pages` — một nguồn sự thật cho
 * luật "page đã xoá mềm coi như không tồn tại".
 */
@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    ClockModule,
    FacebookModule,
    FacebookPagesModule,
  ],
  controllers: [PostInsightsController],
  providers: [PostInsightsRepository, PostInsightsService, InsightsSyncService],
})
export class PostInsightsModule {}
