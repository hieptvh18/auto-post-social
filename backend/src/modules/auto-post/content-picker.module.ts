import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ContentPickerRepository } from './content-picker.repository';

/**
 * Picker tách module riêng vì **hai phía cùng cần**: engine (chọn bài để đăng) và
 * trang cấu hình / lịch (đếm xem mốc giờ còn bài không). Gộp vào `AutoPostModule`
 * sẽ tạo vòng phụ thuộc với `AutoPostConfigsModule`.
 */
@Module({
  imports: [PrismaModule],
  providers: [ContentPickerRepository],
  exports: [ContentPickerRepository],
})
export class ContentPickerModule {}
