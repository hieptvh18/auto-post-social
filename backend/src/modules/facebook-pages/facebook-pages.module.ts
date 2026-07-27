import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { FacebookModule } from '../../infra/facebook/facebook.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import {
  FacebookConnectController,
  FacebookPageTokenController,
} from './facebook-connect.controller';
import { FacebookConnectService } from './facebook-connect.service';
import { FacebookConnectionsRepository } from './facebook-connections.repository';
import { FacebookPagesController } from './facebook-pages.controller';
import { FacebookPagesRepository } from './facebook-pages.repository';
import { FacebookPagesService } from './facebook-pages.service';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    AuditModule,
    FacebookModule,
    SettingsModule,
    ClockModule,
  ],
  // FacebookConnectController phải đứng TRƯỚC FacebookPagesController: route
  // `/pages/connect/...` cần khớp trước `/pages/:id` của controller kia.
  controllers: [
    FacebookConnectController,
    FacebookPageTokenController,
    FacebookPagesController,
  ],
  providers: [
    FacebookPagesRepository,
    FacebookPagesService,
    FacebookConnectionsRepository,
    FacebookConnectService,
  ],
  exports: [FacebookPagesService, FacebookPagesRepository],
})
export class FacebookPagesModule {}
