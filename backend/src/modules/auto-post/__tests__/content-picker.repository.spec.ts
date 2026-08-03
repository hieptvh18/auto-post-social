import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { ContentPickerRepository } from '../content-picker.repository';

/**
 * Picker chạy bằng raw SQL nên unit test chỉ kiểm được **câu lệnh gửi xuống DB**
 * (mệnh đề nào có mặt, tham số nào được truyền). Việc câu lệnh trả đúng bài trên
 * dữ liệu thật phải nghiệm thu bằng smoke test với Postgres — xem plan 07 §6.
 */
function isSqlFragment(value: unknown): value is { strings: string[] } {
  return typeof value === 'object' && value !== null && 'strings' in value;
}

describe('ContentPickerRepository', () => {
  let queryRaw: jest.Mock;
  let repository: ContentPickerRepository;

  // `$queryRaw` được gọi dạng tagged template: đối số đầu là mảng chuỗi tĩnh,
  // các đối số sau là tham số (trong đó có thể có mảnh `Prisma.sql` lồng vào).
  const capturedSql = (): string => {
    const [strings, ...values] = queryRaw.mock.calls[0] as [
      string[],
      ...unknown[],
    ];
    const fragments = values
      .filter((value): value is { strings: string[] } => isSqlFragment(value))
      .map((value) => value.strings.join(' '));
    return [...strings, ...fragments].join(' ');
  };
  const capturedValues = (): unknown[] => {
    const [, ...values] = queryRaw.mock.calls[0] as [string[], ...unknown[]];
    return values.flatMap((value) =>
      isSqlFragment(value) ? (value as { values: unknown[] }).values : [value],
    );
  };

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([]);
    repository = new ContentPickerRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('chỉ lấy bài đã duyệt và assignment chưa đăng ở page đó', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'all',
      limit: 2,
    });

    const sql = capturedSql();
    expect(sql).toContain(
      "c.status IN ('APPROVED', 'PUBLISHING', 'PUBLISHED')",
    );
    expect(sql).toContain('a.published_at IS NULL');
  });

  it('bỏ qua bài đã Ngưng dùng (is_active = false)', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'all',
      limit: 2,
    });

    // Sót mệnh đề này là Bot đăng thật bài đã ngưng dùng (plan 19 §2.2).
    expect(capturedSql()).toContain('c.is_active = TRUE');
  });

  it('đếm kho theo danh mục cũng bỏ bài đã Ngưng dùng (khớp với picker)', async () => {
    await repository.countByCategoryForPage('page-1');

    // Lệch với picker ⇒ UI báo "còn N bài" mà cron lại SKIPPED/NO_CONTENT.
    expect(capturedSql()).toContain('c.is_active = TRUE');
  });

  it('loại bài đang có job QUEUED/PUBLISHING trên page đó (không xếp hàng 2 lần)', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'all',
      limit: 2,
    });

    const sql = capturedSql();
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("j.status IN ('QUEUED', 'PUBLISHING')");
  });

  it('xếp hàng theo updated_at tăng dần và tôn trọng postCount', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'all',
      limit: 3,
    });

    expect(capturedSql()).toContain('ORDER BY c.updated_at ASC');
    expect(capturedValues()).toContain(3);
  });

  it("mediaType 'all' ⇒ KHÔNG thêm mệnh đề lọc media", async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'all',
      limit: 2,
    });

    expect(capturedSql()).not.toContain('c.media_type =');
  });

  it('mediaType cụ thể ⇒ thêm mệnh đề lọc đúng loại', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review'],
      mediaType: 'video',
      limit: 2,
    });

    expect(capturedSql()).toContain('c.media_type =');
    expect(capturedValues()).toContain('video');
  });

  it('truyền page và danh sách category xuống dạng tham số (không nối chuỗi)', async () => {
    await repository.pickForSlot({
      facebookPageId: 'page-1',
      categories: ['Review', 'Thăm khám'],
      mediaType: 'all',
      limit: 2,
    });

    const values = capturedValues();
    expect(values).toContain('page-1');
    expect(values).toContainEqual(['Review', 'Thăm khám']);
  });
});
