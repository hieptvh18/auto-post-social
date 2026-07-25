import { Module } from '@nestjs/common';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { FacebookModule } from '../../infra/facebook/facebook.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { FacebookPagesController } from './facebook-pages.controller';
import { FacebookPagesRepository } from './facebook-pages.repository';
import { FacebookPagesService } from './facebook-pages.service';

@Module({
  imports: [PrismaModule, CryptoModule, AuditModule, FacebookModule],
  controllers: [FacebookPagesController],
  providers: [FacebookPagesRepository, FacebookPagesService],
  exports: [FacebookPagesService, FacebookPagesRepository],
})
export class FacebookPagesModule {}
