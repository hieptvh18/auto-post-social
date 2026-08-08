import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuditHttpModule } from './modules/audit/audit-http.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutoPostConfigsModule } from './modules/auto-post-configs/auto-post-configs.module';
import { AutoPostModule } from './modules/auto-post/auto-post.module';
import { ContentAssetsModule } from './modules/content-assets/content-assets.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FacebookPagesModule } from './modules/facebook-pages/facebook-pages.module';
import { HealthModule } from './modules/health/health.module';
import { ManualPostModule } from './modules/manual-post/manual-post.module';
import { MediaModule } from './modules/media/media.module';
import { MediaUploadJobsModule } from './modules/media-upload-jobs/media-upload-jobs.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { PublishJobsModule } from './modules/publish-jobs/publish-jobs.module';
import { PostInsightsModule } from './modules/post-insights/post-insights.module';
import { PublishScheduleModule } from './modules/publish-schedule/publish-schedule.module';
import { SettingsHttpModule } from './modules/settings/settings-http.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule,
    // Cron auto-post (plan 07). Worker chạy cùng process với API ở MVP (ADR-002).
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          // BullMQ bắt buộc null, khác mặc định của ioredis.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuditHttpModule,
    AuthModule,
    UsersModule,
    MediaModule,
    MediaUploadJobsModule,
    SettingsHttpModule,
    ContentAssetsModule,
    FacebookPagesModule,
    AutoPostConfigsModule,
    PublishJobsModule,
    AutoPostModule,
    ManualPostModule,
    PublishScheduleModule,
    PostInsightsModule,
    MonitorModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    // THỨ TỰ QUAN TRỌNG: JwtAuthGuard phải chạy trước để gắn request.user,
    // PermissionsGuard mới có cái để kiểm. Đảo lại ⇒ mọi route thành 401 sai chỗ.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
