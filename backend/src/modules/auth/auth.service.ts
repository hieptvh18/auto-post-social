import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../../../generated/prisma/client';
import { parseDurationToSeconds } from '../../common/utils/duration';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { PasswordService } from '../../infra/crypto/password.service';
import { UsersRepository } from '../users/users.repository';
import type { LoginDto } from './dto/login.dto';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.validateUser(dto.email, dto.password);
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toAuthenticatedUser(user) };
  }

  /**
   * Sai email và sai password trả về CÙNG một thông báo — không tiết lộ
   * email nào tồn tại trong hệ thống.
   */
  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);
    if (user === null) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const matched = await this.passwordService.compare(
      password,
      user.passwordHash,
    );
    if (!matched) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }
    return user;
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const payload = await this.verify(
      refreshToken,
      this.config.jwt.refreshSecret,
    );
    const user = await this.loadActiveUser(payload.sub);
    return this.issueTokens(user);
  }

  /** Dùng bởi JwtAuthGuard: verify access token rồi nạp lại user từ DB. */
  async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    const payload = await this.verify(
      accessToken,
      this.config.jwt.accessSecret,
    );
    const user = await this.loadActiveUser(payload.sub);
    return this.toAuthenticatedUser(user);
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    return this.toAuthenticatedUser(await this.loadActiveUser(userId));
  }

  private async loadActiveUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (user === null || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không còn hiệu lực');
    }
    return user;
  }

  private async verify(token: string, secret: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }

  private async issueTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const jwt = this.config.jwt;
    // Quy đổi '15m'/'7d' sang giây rồi truyền số — tránh phụ thuộc kiểu
    // template `StringValue` của thư viện ms, và tái dùng cho field expiresIn.
    const accessExpires = parseDurationToSeconds(jwt.accessExpires);
    const refreshExpires = parseDurationToSeconds(jwt.refreshExpires);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwt.accessSecret,
        expiresIn: accessExpires,
      }),
      this.jwtService.signAsync(payload, {
        secret: jwt.refreshSecret,
        expiresIn: refreshExpires,
      }),
    ]);

    return { accessToken, refreshToken, expiresIn: accessExpires };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
