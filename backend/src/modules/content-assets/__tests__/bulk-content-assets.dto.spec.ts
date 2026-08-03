import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryContentAssetsDto } from '../dto/query-content-assets.dto';
import {
  BULK_MAX_ITEMS,
  BulkIdsDto,
  BulkSetActiveDto,
} from '../dto/bulk-content-assets.dto';

const UUID = '11111111-1111-4111-8111-111111111111';

function errorsOf(
  cls: typeof BulkIdsDto | typeof BulkSetActiveDto,
  payload: Record<string, unknown>,
): string[] {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto).map((e) => e.property);
}

describe('BulkIdsDto', () => {
  it('danh sách uuid hợp lệ ⇒ không lỗi', () => {
    expect(errorsOf(BulkIdsDto, { ids: [UUID] })).toEqual([]);
  });

  it('mảng rỗng ⇒ lỗi (bấm nhầm không nên gọi API)', () => {
    expect(errorsOf(BulkIdsDto, { ids: [] })).toContain('ids');
  });

  it(`quá ${BULK_MAX_ITEMS} id ⇒ lỗi`, () => {
    const ids = Array.from({ length: BULK_MAX_ITEMS + 1 }, () => UUID);
    expect(errorsOf(BulkIdsDto, { ids })).toContain('ids');
  });

  it(`đúng ${BULK_MAX_ITEMS} id ⇒ vẫn hợp lệ`, () => {
    const ids = Array.from({ length: BULK_MAX_ITEMS }, () => UUID);
    expect(errorsOf(BulkIdsDto, { ids })).toEqual([]);
  });

  it('phần tử không phải uuid ⇒ lỗi', () => {
    expect(errorsOf(BulkIdsDto, { ids: [UUID, 'abc'] })).toContain('ids');
  });
});

describe('BulkSetActiveDto', () => {
  it('thiếu isActive ⇒ lỗi', () => {
    expect(errorsOf(BulkSetActiveDto, { ids: [UUID] })).toContain('isActive');
  });

  it('isActive là chuỗi ⇒ lỗi (không tự ép kiểu cho body JSON)', () => {
    expect(
      errorsOf(BulkSetActiveDto, { ids: [UUID], isActive: 'false' }),
    ).toContain('isActive');
  });

  it('payload đầy đủ ⇒ không lỗi', () => {
    expect(
      errorsOf(BulkSetActiveDto, { ids: [UUID], isActive: false }),
    ).toEqual([]);
  });
});

/**
 * ValidationPipe của app bật `enableImplicitConversion` ⇒ `Boolean('false')` chạy
 * **trước** `@Transform`. Test này khoá lại đúng cái bẫy đó: thiếu nó thì mọi bộ
 * lọc boolean âm thầm biến thành `true` (đã xảy ra thật với `?isAds=false`).
 */
describe('QueryContentAssetsDto — bộ lọc boolean từ query string', () => {
  const parse = (query: Record<string, unknown>): QueryContentAssetsDto =>
    plainToInstance(QueryContentAssetsDto, query, {
      enableImplicitConversion: true,
    });

  it.each(['isAds', 'isActive'] as const)(
    '%s=false ⇒ false (không bị Boolean("false") biến thành true)',
    (field) => {
      expect(parse({ [field]: 'false' })[field]).toBe(false);
    },
  );

  it.each(['isAds', 'isActive'] as const)('%s=true ⇒ true', (field) => {
    expect(parse({ [field]: 'true' })[field]).toBe(true);
  });

  it.each(['isAds', 'isActive'] as const)(
    'không truyền %s ⇒ undefined (không lọc)',
    (field) => {
      expect(parse({})[field]).toBeUndefined();
    },
  );

  it('giá trị lạ ⇒ báo lỗi chứ không âm thầm thành true', () => {
    const errors = validateSync(parse({ isActive: 'yes' }));
    expect(errors.map((e) => e.property)).toContain('isActive');
  });
});
