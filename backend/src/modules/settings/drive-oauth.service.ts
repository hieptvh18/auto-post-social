import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { SettingsService } from './settings.service';

/** Bản OAuth2Client mà chính `googleapis` dùng — tránh lệch với google-auth-library ngoài. */
type DriveOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive'];
const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingState {
  actorId: string;
  expiresAt: number;
}

/**
 * OAuth2 authorization-code flow cho Drive (chế độ Gmail free).
 * State lưu trong bộ nhớ, single-use + TTL ngắn để chống CSRF ở callback public.
 */
@Injectable()
export class DriveOAuthService {
  private readonly logger = new Logger('DriveOAuth');
  private readonly pending = new Map<string, PendingState>();

  constructor(
    private readonly settingsService: SettingsService,
    private readonly config: AppConfigService,
  ) {}

  private redirectUri(): string {
    return `${this.config.appBaseUrl}/${this.config.apiPrefix}/settings/google-drive/oauth/callback`;
  }

  private async client(): Promise<DriveOAuth2Client> {
    const { clientId, clientSecret } =
      await this.settingsService.getOauthClientCredentials();
    return new google.auth.OAuth2(clientId, clientSecret, this.redirectUri());
  }

  /** URL để redirect browser sang màn consent của Google. */
  async buildAuthUrl(actorId: string): Promise<string> {
    const client = await this.client();
    const state = randomBytes(24).toString('hex');
    this.sweep();
    this.pending.set(state, {
      actorId,
      expiresAt: Date.now() + STATE_TTL_MS,
    });

    return client.generateAuthUrl({
      access_type: 'offline', // để nhận refresh_token
      prompt: 'consent', // buộc trả refresh_token kể cả đã consent trước đó
      scope: OAUTH_SCOPES,
      state,
    });
  }

  /** Đổi authorization code lấy refresh token, lưu lại (mã hoá). */
  async handleCallback(code: string, state: string): Promise<void> {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (pending === undefined || pending.expiresAt < Date.now()) {
      throw new BadRequestException(
        'Phiên kết nối Google không hợp lệ hoặc đã hết hạn. Bấm "Kết nối Google" lại.',
      );
    }

    const client = await this.client();
    const { tokens } = await client.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (refreshToken === null || refreshToken === undefined) {
      throw new BadRequestException(
        'Google không trả refresh token. Vào https://myaccount.google.com/permissions ' +
          'gỡ quyền ứng dụng rồi kết nối lại.',
      );
    }

    client.setCredentials(tokens);
    const accountEmail = await this.fetchAccountEmail(client);
    await this.settingsService.saveOauthTokens(
      refreshToken,
      accountEmail,
      pending.actorId,
    );
    this.logger.log(`OAuth Drive kết nối cho tài khoản ${accountEmail ?? '?'}`);
  }

  private async fetchAccountEmail(
    auth: DriveOAuth2Client,
  ): Promise<string | null> {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const res = await drive.about.get({ fields: 'user(emailAddress)' });
      return res.data.user?.emailAddress ?? null;
    } catch {
      // Không lấy được email không phải lỗi chặn — vẫn lưu được token.
      return null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, value] of this.pending) {
      if (value.expiresAt < now) this.pending.delete(key);
    }
  }
}
