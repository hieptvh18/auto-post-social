import { Module } from '@nestjs/common';
import { DriveModule } from '../../infra/drive/drive.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ContentAssetsController } from './content-assets.controller';
import { ContentAssetsRepository } from './content-assets.repository';
import { ContentAssetsService } from './content-assets.service';

@Module({
  imports: [PrismaModule, DriveModule, AuditModule],
  controllers: [ContentAssetsController],
  providers: [ContentAssetsRepository, ContentAssetsService],
})
export class ContentAssetsModule {}
