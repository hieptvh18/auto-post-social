import { Module } from '@nestjs/common';
import { DriveModule } from '../../infra/drive/drive.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
// Ô "Editor" chỉ nhận account role EDITOR ⇒ mượn UsersRepository để tra/validate.
import { UsersModule } from '../users/users.module';
import { ContentAssetsController } from './content-assets.controller';
import { ContentAssetsRepository } from './content-assets.repository';
import { ContentAssetsService } from './content-assets.service';

@Module({
  imports: [PrismaModule, DriveModule, AuditModule, UsersModule],
  controllers: [ContentAssetsController],
  providers: [ContentAssetsRepository, ContentAssetsService],
  // ManualPostModule (plan 09) đọc content qua repository này thay vì tự query Prisma.
  // MediaUploadJobsModule (plan 23) tạo bài qua `create()` của service — dùng
  // chung đúng một đường tạo bài với `POST /content-assets`.
  exports: [ContentAssetsRepository, ContentAssetsService],
})
export class ContentAssetsModule {}
