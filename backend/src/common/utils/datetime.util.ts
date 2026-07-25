import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

export const DATE_FORMAT = 'YYYY-MM-DD';
export const TIME_FORMAT = 'HH:mm';

/** Ngày hôm nay theo timezone hiển thị, dạng 'YYYY-MM-DD'. */
export function todayInTz(now: Date, timezone: string): string {
  return dayjs(now).tz(timezone).format(DATE_FORMAT);
}

/** 'HH:mm' của một mốc thời gian UTC, đọc theo timezone hiển thị. */
export function timeInTz(at: Date, timezone: string): string {
  return dayjs(at).tz(timezone).format(TIME_FORMAT);
}

/**
 * Khoảng UTC `[from, to)` phủ đúng một ngày theo timezone hiển thị.
 * DB lưu UTC (rule 01) nên mọi truy vấn "trong ngày" phải đi qua đây, không
 * được so sánh thẳng chuỗi ngày.
 */
export function dayRangeUtc(
  date: string,
  timezone: string,
): { from: Date; to: Date } {
  const start = dayjs.tz(`${date} 00:00`, timezone);
  return { from: start.toDate(), to: start.add(1, 'day').toDate() };
}

/**
 * Mốc giờ `'HH:mm'` của `date` đã qua so với `now` hay chưa (cùng đọc theo
 * timezone hiển thị). Ngày quá khứ ⇒ luôn qua; ngày tương lai ⇒ chưa qua.
 */
export function hasSlotTimePassed(
  date: string,
  time: string,
  now: Date,
  timezone: string,
): boolean {
  return dayjs(now).isAfter(dayjs.tz(`${date} ${time}`, timezone));
}
