import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Secret/expiresIn truyền tường minh ở mỗi lần sign/verify (access vs refresh
// dùng 2 secret khác nhau) nên JwtModule không cần register async config.
@Module({
  imports: [JwtModule.register({}), UsersModule, CryptoModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
