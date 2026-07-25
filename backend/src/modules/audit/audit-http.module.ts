import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditModule } from './audit.module';

/**
 * Đường **đọc** audit log tách riêng khỏi `AuditModule`.
 *
 * `AuditModule` được gần như mọi module nghiệp vụ import để *ghi* log; gắn thêm
 * controller vào chính nó là đường ngắn nhất tới vòng phụ thuộc — đúng vết xe đổ
 * của `SettingsModule` (contexts.md §7). Module này chỉ có controller, nạp ở
 * `AppModule` và không ai import nó.
 */
@Module({
  imports: [AuditModule],
  controllers: [AuditController],
})
export class AuditHttpModule {}
