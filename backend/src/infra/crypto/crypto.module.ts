import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { PasswordService } from './password.service';

// AppConfigModule là @Global nên CryptoService inject AppConfigService trực tiếp.
@Module({
  providers: [PasswordService, CryptoService],
  exports: [PasswordService, CryptoService],
})
export class CryptoModule {}
