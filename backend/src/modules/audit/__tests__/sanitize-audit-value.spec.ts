import { MASK, isSecretKey, sanitizeAuditValue } from '../sanitize-audit-value';

describe('sanitizeAuditValue', () => {
  describe('lọc secret', () => {
    it('che giá trị của key access token ở mức đầu tiên', () => {
      const result = sanitizeAuditValue({
        pageName: 'Page A',
        accessToken: 'EAAG-token-that',
      });

      expect(result).toEqual({ pageName: 'Page A', accessToken: MASK });
    });

    it('che token lồng sâu nhiều tầng', () => {
      const result = sanitizeAuditValue({
        drive: { oauth: { config: { refresh_token: 'rt-1' } } },
      });

      expect(result).toEqual({
        drive: { oauth: { config: { refresh_token: MASK } } },
      });
    });

    it('che cả cây con khi chính tên nhánh là secret', () => {
      const result = sanitizeAuditValue({
        serviceAccount: { private_key: 'pk', client_email: 'a@b.c' },
      });

      // Không được lộ mảnh nào của service account, kể cả email.
      expect(result).toEqual({ serviceAccount: MASK });
    });

    it('che secret nằm trong phần tử của mảng', () => {
      const result = sanitizeAuditValue([
        { pageId: '1', accessToken: 'tok-1' },
        { pageId: '2', accessToken: 'tok-2' },
      ]);

      expect(result).toEqual([
        { pageId: '1', accessToken: MASK },
        { pageId: '2', accessToken: MASK },
      ]);
    });

    it('bắt mọi biến thể tên key: snake_case, camelCase, có tiền tố', () => {
      const result = sanitizeAuditValue({
        client_secret: 'a',
        clientSecret: 'b',
        newAccessToken: 'c',
        PASSWORD: 'd',
        apiKey: 'e',
      });

      expect(result).toEqual({
        client_secret: MASK,
        clientSecret: MASK,
        newAccessToken: MASK,
        PASSWORD: MASK,
        apiKey: MASK,
      });
    });

    it('không che field bình thường', () => {
      const result = sanitizeAuditValue({
        status: 'APPROVED',
        isAds: true,
        postCount: 3,
      });

      expect(result).toEqual({ status: 'APPROVED', isAds: true, postCount: 3 });
    });
  });

  describe('giá trị biên', () => {
    it('null/undefined ⇒ null', () => {
      expect(sanitizeAuditValue(null)).toBeNull();
      expect(sanitizeAuditValue(undefined)).toBeNull();
    });

    it('giữ nguyên giá trị nguyên thuỷ', () => {
      expect(sanitizeAuditValue('APPROVED')).toBe('APPROVED');
      expect(sanitizeAuditValue(7)).toBe(7);
      expect(sanitizeAuditValue(false)).toBe(false);
    });

    it('null nằm trong object vẫn là null, không bị bỏ key', () => {
      expect(sanitizeAuditValue({ rejectComment: null })).toEqual({
        rejectComment: null,
      });
    });

    it('cắt chuỗi quá dài để không phình cột JSONB', () => {
      const result = sanitizeAuditValue({ caption: 'x'.repeat(5000) });

      const caption = (result as { caption: string }).caption;
      expect(caption.length).toBeLessThanOrEqual(2001);
      expect(caption.endsWith('…')).toBe(true);
    });

    it('cắt mảng quá dài', () => {
      const result = sanitizeAuditValue(
        Array.from({ length: 120 }, (_, i) => i),
      );

      expect((result as number[]).length).toBe(50);
    });

    it('chặn cây quá sâu thay vì đệ quy vô hạn', () => {
      let deep: unknown = 'đáy';
      for (let i = 0; i < 12; i += 1) deep = { child: deep };

      // Chỉ cần không ném lỗi và có dấu hiệu bị cắt.
      expect(JSON.stringify(sanitizeAuditValue(deep))).toContain('[quá sâu]');
    });

    it('kiểu không serialize được ⇒ mô tả kiểu, không ném lỗi', () => {
      expect(sanitizeAuditValue({ fn: () => 1 })).toEqual({
        fn: '[function]',
      });
    });
  });

  describe('isSecretKey', () => {
    it.each([
      'token',
      'accessToken',
      'client_secret',
      'PASSWORD',
      'privateKey',
    ])('%s là secret', (key) => {
      expect(isSecretKey(key)).toBe(true);
    });

    it.each(['status', 'pageName', 'postCount'])(
      '%s không phải secret',
      (key) => {
        expect(isSecretKey(key)).toBe(false);
      },
    );
  });
});
