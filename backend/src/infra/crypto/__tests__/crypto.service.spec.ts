import { InternalServerErrorException } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service';
import { CryptoService } from '../crypto.service';

const KEY = 'a'.repeat(64);

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    const config = { tokenEncryptionKey: KEY } as AppConfigService;
    service = new CryptoService(config);
  });

  describe('encrypt', () => {
    it('trả về đúng format iv:authTag:ciphertext', () => {
      const encrypted = service.encrypt('secret');

      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('sinh ciphertext khác nhau cho cùng plaintext (IV ngẫu nhiên)', () => {
      expect(service.encrypt('secret')).not.toBe(service.encrypt('secret'));
    });
  });

  describe('decrypt', () => {
    it('round-trip trả lại đúng plaintext gốc', () => {
      const plain = JSON.stringify({ client_email: 'sa@project.iam' });

      expect(service.decrypt(service.encrypt(plain))).toBe(plain);
    });

    it('round-trip đúng với chuỗi unicode tiếng Việt', () => {
      const plain = 'Cấu hình Đăng bài tự động';

      expect(service.decrypt(service.encrypt(plain))).toBe(plain);
    });

    it('ném lỗi khi chuỗi không đủ 3 phần', () => {
      expect(() => service.decrypt('abc:def')).toThrow(
        InternalServerErrorException,
      );
    });

    it('ném lỗi khi ciphertext bị sửa (authTag không khớp)', () => {
      const [iv, tag] = service.encrypt('secret').split(':');
      const tampered = [iv, tag, Buffer.from('hacked').toString('base64')].join(
        ':',
      );

      expect(() => service.decrypt(tampered)).toThrow(
        InternalServerErrorException,
      );
    });

    it('ném lỗi khi giải mã bằng khoá khác', () => {
      const encrypted = service.encrypt('secret');
      const other = new CryptoService({
        tokenEncryptionKey: 'b'.repeat(64),
      } as AppConfigService);

      expect(() => other.decrypt(encrypted)).toThrow(
        InternalServerErrorException,
      );
    });
  });
});
