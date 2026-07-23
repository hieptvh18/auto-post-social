import { PasswordService } from '../password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  describe('hash + compare', () => {
    it('băm rồi so khớp đúng mật khẩu gốc', async () => {
      const hash = await service.hash('TempPass123!');

      expect(hash).not.toBe('TempPass123!');
      await expect(service.compare('TempPass123!', hash)).resolves.toBe(true);
    });

    it('trả false khi mật khẩu sai', async () => {
      const hash = await service.hash('TempPass123!');

      await expect(service.compare('SaiRoi!', hash)).resolves.toBe(false);
    });

    it('sinh hash khác nhau cho cùng mật khẩu (salt ngẫu nhiên)', async () => {
      const [a, b] = await Promise.all([
        service.hash('TempPass123!'),
        service.hash('TempPass123!'),
      ]);

      expect(a).not.toBe(b);
    });
  });
});
