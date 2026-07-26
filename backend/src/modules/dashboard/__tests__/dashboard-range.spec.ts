import { BadRequestException } from '@nestjs/common';
import {
  fillDateRange,
  listDates,
  resolveDashboardRange,
} from '../dashboard-range';

const TZ = 'Asia/Ho_Chi_Minh';
/** 25/07/2026 17:00 UTC = 26/07/2026 00:00 giờ VN — cố tình chọn mốc đã sang ngày mới ở VN. */
const NOW = new Date('2026-07-25T17:00:00Z');

describe('resolveDashboardRange', () => {
  it('bỏ trống from/to ⇒ lấy 7 ngày gần nhất tính theo ngày Việt Nam', () => {
    const range = resolveDashboardRange(undefined, undefined, NOW, TZ);

    // Giờ UTC vẫn là 25/07 nhưng ở VN đã là 26/07 ⇒ kỳ phải kết thúc ở 26/07.
    expect(range.to).toBe('2026-07-26');
    expect(range.from).toBe('2026-07-20');
  });

  it('quy đổi biên kỳ sang UTC theo giờ VN (nửa mở, tính cả ngày `to`)', () => {
    const range = resolveDashboardRange('2026-07-20', '2026-07-26', NOW, TZ);

    // 00:00 ngày 20/07 giờ VN = 17:00 ngày 19/07 UTC.
    expect(range.fromUtc.toISOString()).toBe('2026-07-19T17:00:00.000Z');
    // Chặn trên là 00:00 ngày 27/07 giờ VN ⇒ bài lúc 23:59 ngày 26/07 vẫn được tính.
    expect(range.toUtc.toISOString()).toBe('2026-07-26T17:00:00.000Z');
  });

  it('chỉ có `to` ⇒ suy ra `from` lùi 7 ngày từ chính `to`, không phải từ hôm nay', () => {
    const range = resolveDashboardRange(undefined, '2026-07-10', NOW, TZ);

    expect(range.from).toBe('2026-07-04');
    expect(range.to).toBe('2026-07-10');
  });

  it('ném BadRequest khi from > to', () => {
    expect(() =>
      resolveDashboardRange('2026-07-26', '2026-07-20', NOW, TZ),
    ).toThrow(BadRequestException);
  });

  it('chấp nhận đúng 366 ngày nhưng chặn 367 ngày', () => {
    expect(() =>
      resolveDashboardRange('2026-01-01', '2027-01-01', NOW, TZ),
    ).not.toThrow();

    expect(() =>
      resolveDashboardRange('2026-01-01', '2027-01-02', NOW, TZ),
    ).toThrow(BadRequestException);
  });

  it('from == to ⇒ khoảng đúng 1 ngày', () => {
    const range = resolveDashboardRange('2026-07-20', '2026-07-20', NOW, TZ);

    expect(listDates(range, TZ)).toEqual(['2026-07-20']);
  });
});

describe('fillDateRange', () => {
  it('điền ngày không có dữ liệu bằng giá trị 0 thay vì bỏ trống', () => {
    const range = resolveDashboardRange('2026-07-20', '2026-07-24', NOW, TZ);

    const filled = fillDateRange(
      range,
      TZ,
      [
        { date: '2026-07-21', success: 3, failed: 0 },
        { date: '2026-07-24', success: 1, failed: 2 },
      ],
      (date) => ({ date, success: 0, failed: 0 }),
    );

    expect(filled).toEqual([
      { date: '2026-07-20', success: 0, failed: 0 },
      { date: '2026-07-21', success: 3, failed: 0 },
      { date: '2026-07-22', success: 0, failed: 0 },
      { date: '2026-07-23', success: 0, failed: 0 },
      { date: '2026-07-24', success: 1, failed: 2 },
    ]);
  });

  it('không có dữ liệu nào ⇒ vẫn trả đủ số ngày của kỳ', () => {
    const range = resolveDashboardRange('2026-07-20', '2026-07-26', NOW, TZ);

    const filled = fillDateRange(range, TZ, [], (date) => ({
      date,
      success: 0,
      failed: 0,
    }));

    expect(filled).toHaveLength(7);
    expect(filled.every((row) => row.success === 0)).toBe(true);
  });
});
