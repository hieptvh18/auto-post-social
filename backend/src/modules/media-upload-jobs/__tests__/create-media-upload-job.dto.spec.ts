import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateMediaUploadJobDto } from '../dto/create-media-upload-job.dto';

/**
 * Multipart không có kiểu — `isSourceNew` tới dạng chuỗi. ValidationPipe bật
 * `enableImplicitConversion` ⇒ `Boolean('false')` = true chạy trước @Transform.
 * Test khoá lại để bỏ tick "Nguồn mới" không bị lưu thành Mới (plan 36).
 */
describe('CreateMediaUploadJobDto — isSourceNew từ multipart', () => {
  const parse = (extra: Record<string, unknown>): CreateMediaUploadJobDto =>
    plainToInstance(
      CreateMediaUploadJobDto,
      { title: 'A', category: 'B', caption: 'C', ...extra },
      { enableImplicitConversion: true },
    );

  it("'false' ⇒ false", () => {
    expect(parse({ isSourceNew: 'false' }).isSourceNew).toBe(false);
  });

  it("'true' ⇒ true", () => {
    expect(parse({ isSourceNew: 'true' }).isSourceNew).toBe(true);
  });

  it('không gửi ⇒ undefined (DB default true)', () => {
    expect(parse({}).isSourceNew).toBeUndefined();
  });

  it('giá trị lạ ⇒ báo lỗi validate', () => {
    const errors = validateSync(parse({ isSourceNew: 'yes' }));
    expect(errors.map((e) => e.property)).toContain('isSourceNew');
  });
});
