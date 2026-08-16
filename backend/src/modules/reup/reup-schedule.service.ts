import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SettingsService } from '../settings/settings.service';
import type {
  ReupScheduleSettingsResponse,
  ReupScheduleSettingsValue,
} from '../settings/settings.types';
import { ReupCleanupService } from './reup-cleanup.service';
import { ReupDiscoveryService } from './reup-discovery.service';
import {
  REUP_CLEANUP_CRON_NAME,
  REUP_CRON_TIMEZONE,
  REUP_DISCOVERY_CRON_NAME,
} from './reup.constants';

/**
 * Đăng ký/gỡ hai cron reup theo lịch lưu ở `app_settings['reup_schedule']`
 * (plan 32 §3.2 hướng a).
 *
 * Vì sao KHÔNG dùng `@Cron('0 2 * * *')`: decorator đọc chuỗi cron lúc class
 * được nạp ⇒ đổi giờ trong DB không có tác dụng cho tới khi restart app. Ở đây
 * job được tạo bằng tay qua `SchedulerRegistry` nên `rescheduleAll()` có hiệu
 * lực ngay sau khi bấm Lưu.
 */
@Injectable()
export class ReupScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ReupScheduleService.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly discovery: ReupDiscoveryService,
    private readonly cleanup: ReupCleanupService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rescheduleAll();
  }

  async getSettings(): Promise<ReupScheduleSettingsResponse> {
    const value = await this.settings.getReupScheduleConfig();
    return {
      ...value,
      discoveryNextRunAt: this.nextRunAt(REUP_DISCOVERY_CRON_NAME),
      cleanupNextRunAt: this.nextRunAt(REUP_CLEANUP_CRON_NAME),
      updatedAt: await this.settings.getReupScheduleUpdatedAt(),
    };
  }

  async updateSettings(
    input: ReupScheduleSettingsValue,
    actorId: string,
  ): Promise<ReupScheduleSettingsResponse> {
    await this.settings.updateReupScheduleSettings(input, actorId);
    // Lưu xong phải đăng ký lại NGAY — không có bước này thì giờ mới chỉ nằm
    // trong DB, cron vẫn chạy theo giờ cũ cho tới lần restart.
    await this.rescheduleAll();
    return this.getSettings();
  }

  /**
   * Nguồn sự thật duy nhất dựng job từ settings. Gọi lúc boot và sau mỗi lần lưu.
   *
   * `getReupScheduleConfig()` đã tự nuốt lỗi và trả mặc định (R3) nên hàm này
   * luôn có cấu hình hợp lệ để làm việc.
   */
  async rescheduleAll(): Promise<void> {
    const config = await this.settings.getReupScheduleConfig();

    await this.applyJob(
      REUP_DISCOVERY_CRON_NAME,
      config.discoveryEnabled,
      config.discoveryTime,
      () => this.runDiscovery(),
    );
    await this.applyJob(
      REUP_CLEANUP_CRON_NAME,
      config.cleanupEnabled,
      config.cleanupTime,
      () => this.runCleanup(),
    );
  }

  private async applyJob(
    name: string,
    enabled: boolean,
    time: string,
    onTick: () => Promise<void>,
  ): Promise<void> {
    await this.removeJob(name);
    if (!enabled) {
      this.logger.log(`Cron ${name} đang tắt — không đăng ký.`);
      return;
    }

    const cronTime = toCronExpression(time);
    const job = CronJob.from({
      cronTime,
      onTick,
      timeZone: REUP_CRON_TIMEZONE,
      start: false,
    });
    this.registry.addCronJob(name, job);
    job.start();
    this.logger.log(
      `Cron ${name} đăng ký lúc ${time} (${REUP_CRON_TIMEZONE}).`,
    );
  }

  /**
   * Hai cạm bẫy của plan §3.2 nằm trọn ở đây:
   *
   * 1. `deleteCronJob` NÉM LỖI khi job chưa tồn tại ⇒ phải hỏi `doesExist`
   *    trước, nếu không lần boot đầu (chưa có job nào) là app chết.
   * 2. Phải `stop()` TRƯỚC khi xoá khỏi registry. Gỡ khỏi registry không làm
   *    job ngừng tick — bỏ qua bước này là có **hai** cron cùng chạy sau vài
   *    lần đổi giờ, khoá chống double-fire ở DB che mất triệu chứng nên cực
   *    khó lần ra.
   */
  private async removeJob(name: string): Promise<void> {
    if (!this.registry.doesExist('cron', name)) return;
    const job = this.registry.getCronJob(name);
    await job.stop();
    this.registry.deleteCronJob(name);
  }

  private nextRunAt(name: string): Date | null {
    if (!this.registry.doesExist('cron', name)) return null;
    return this.registry.getCronJob(name).nextDate().toJSDate();
  }

  /**
   * Chốt chặn QĐ-6: lỗi của reup không được ném ra ngoài — `onTick` ném là
   * `cron` in stack trace của cả process, và ở đây không còn scheduler của Nest
   * bọc hộ như hồi dùng `@Cron`.
   */
  private async runDiscovery(): Promise<void> {
    try {
      // actorId = null ⇒ audit log ghi actor là Bot/Hệ thống (plan 31 §3.1).
      const results = await this.discovery.discoverAll(null);
      if (results.length > 0) {
        const picked = results.reduce((sum, run) => sum + run.pickedCount, 0);
        this.logger.log(
          `Cron reup xong: ${results.length} chủ đề, chọn tổng ${picked} video`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Cron reup lỗi ngoài dự kiến: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async runCleanup(): Promise<void> {
    try {
      const result = await this.cleanup.run(null);
      if (result.deletedCount > 0 || result.failedCount > 0) {
        this.logger.log(
          `Cron dọn dẹp reup xong: xoá ${result.deletedCount} file, giải phóng ${result.freedBytes} byte, lỗi ${result.failedCount}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Cron dọn dẹp reup lỗi ngoài dự kiến: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** `'02:30'` → `'30 2 * * *'`. Chuỗi đã được service validate theo `HH:mm`. */
function toCronExpression(time: string): string {
  const [hour, minute] = time.split(':');
  return `${Number(minute)} ${Number(hour)} * * *`;
}
