import { BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';
import { DATE_FORMAT, dayRangeUtc } from '../../common/utils/datetime.util';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

/** Bỏ trống `from`/`to` ⇒ 7 ngày gần nhất, KHÔNG phải toàn bộ lịch sử (plan 14 §3.2). */
export const DEFAULT_RANGE_DAYS = 7;

/**
 * Trần độ dài khoảng ngày. Không có trần thì một request `from=2000-01-01` quét
 * cả bảng `publish_jobs` và vẽ chart 9000 cột — chậm mà cũng không ai đọc được.
 */
export const MAX_RANGE_DAYS = 366;

export interface DashboardRange {
  /** Ngày đầu kỳ theo giờ VN, `'YYYY-MM-DD'` — trả lại cho client để hiển thị. */
  from: string;
  /** Ngày cuối kỳ theo giờ VN, tính **cả** ngày này. */
  to: string;
  /** Mốc UTC `[fromUtc, toUtc)` để so sánh với cột timestamp trong DB. */
  fromUtc: Date;
  toUtc: Date;
}

/**
 * Quy đổi `from`/`to` (ngày VN) sang khoảng UTC nửa mở `[fromUtc, toUtc)`.
 *
 * DB lưu UTC (rule 01) nên **mọi** truy vấn theo ngày phải đi qua đây; so sánh
 * thẳng chuỗi ngày là nguồn lệch 7 tiếng kinh điển.
 */
export function resolveDashboardRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
  timezone: string,
): DashboardRange {
  const today = dayjs(now).tz(timezone).format(DATE_FORMAT);
  const resolvedTo = to ?? today;
  const resolvedFrom =
    from ??
    dayjs
      .tz(`${resolvedTo} 00:00`, timezone)
      .subtract(DEFAULT_RANGE_DAYS - 1, 'day')
      .format(DATE_FORMAT);

  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('`from` phải nhỏ hơn hoặc bằng `to`');
  }

  const days = countDaysInclusive(resolvedFrom, resolvedTo, timezone);
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày (đang chọn ${days} ngày)`,
    );
  }

  return {
    from: resolvedFrom,
    to: resolvedTo,
    fromUtc: dayRangeUtc(resolvedFrom, timezone).from,
    // Nửa mở: lấy tới 00:00 ngày kế tiếp để **tính cả** ngày `to`.
    toUtc: dayRangeUtc(resolvedTo, timezone).to,
  };
}

/** Danh sách ngày `'YYYY-MM-DD'` liên tục phủ kín khoảng, kể cả ngày không có dữ liệu. */
export function listDates(range: DashboardRange, timezone: string): string[] {
  const dates: string[] = [];
  let cursor = dayjs.tz(`${range.from} 00:00`, timezone);
  const last = dayjs.tz(`${range.to} 00:00`, timezone);
  while (!cursor.isAfter(last)) {
    dates.push(cursor.format(DATE_FORMAT));
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

/**
 * Điền ngày trống bằng giá trị 0. Không điền thì chart nhảy cóc từ 19/07 sang
 * 23/07 và người đọc tưởng 3 ngày kia mất dữ liệu chứ không phải không có bài.
 */
export function fillDateRange<T extends { date: string }>(
  range: DashboardRange,
  timezone: string,
  rows: T[],
  empty: (date: string) => T,
): T[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return listDates(range, timezone).map(
    (date) => byDate.get(date) ?? empty(date),
  );
}

function countDaysInclusive(
  from: string,
  to: string,
  timezone: string,
): number {
  return (
    dayjs
      .tz(`${to} 00:00`, timezone)
      .diff(dayjs.tz(`${from} 00:00`, timezone), 'day') + 1
  );
}
