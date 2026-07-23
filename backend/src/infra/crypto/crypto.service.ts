import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
/** 12 byte là độ dài IV khuyến nghị cho GCM. */
const IV_LENGTH = 12;
const PARTS_COUNT = 3;

/**
 * Mã hoá đối xứng cho secret lưu trong DB (token FB, service account JSON).
 * Format: `iv:authTag:ciphertext`, cả 3 phần base64 (rule 01 §Bảo mật).
 *
 * Khoá lấy từ TOKEN_ENCRYPTION_KEY (hex 32 byte). Đổi khoá ⇒ mọi ciphertext cũ
 * không giải mã được nữa — người dùng phải nhập lại secret.
 */
@Injectable()
export class CryptoService {
  constructor(private readonly config: AppConfigService) {}

  private get key(): Buffer {
    return Buffer.from(this.config.tokenEncryptionKey, 'hex');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /**
   * Giải mã. Ciphertext hỏng/bị sửa ⇒ authTag không khớp ⇒ ném lỗi,
   * KHÔNG trả về dữ liệu rác.
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== PARTS_COUNT) {
      throw new InternalServerErrorException(
        'Dữ liệu mã hoá sai định dạng (cần iv:authTag:ciphertext)',
      );
    }

    const [ivB64, authTagB64, ciphertextB64] = parts;

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(ivB64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Nuốt lỗi gốc: message của node crypto có thể lộ chi tiết về khoá.
      throw new InternalServerErrorException(
        'Không giải mã được dữ liệu — sai khoá mã hoá hoặc dữ liệu đã hỏng. Vui lòng nhập lại.',
      );
    }
  }
}
