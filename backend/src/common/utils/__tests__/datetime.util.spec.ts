import {
  dayRangeUtc,
  hasSlotTimePassed,
  timeInTz,
  todayInTz,
} from '../datetime.util';

const TZ = 'Asia/Ho_Chi_Minh';

describe('datetime.util', () => {
  describe('todayInTz', () => {
    it('lấy ngày theo giờ VN, không theo UTC', () => {
      // 23:30 UTC 24/07 = 06:30 VN 25/07.
      expect(todayInTz(new Date('2026-07-24T23:30:00Z'), TZ)).toBe(
        '2026-07-25',
      );
    });
  });

  describe('timeInTz', () => {
    it('đổi mốc UTC sang HH:mm giờ VN', () => {
      expect(timeInTz(new Date('2026-07-25T01:00:00Z'), TZ)).toBe('08:00');
    });
  });

  describe('dayRangeUtc', () => {
    it('phủ đúng 24h của ngày theo giờ VN', () => {
      const { from, to } = dayRangeUtc('2026-07-25', TZ);

      expect(from.toISOString()).toBe('2026-07-24T17:00:00.000Z');
      expect(to.toISOString()).toBe('2026-07-25T17:00:00.000Z');
    });
  });

  describe('hasSlotTimePassed', () => {
    const now = new Date('2026-07-25T10:00:00Z'); // 17:00 VN

    it('mốc giờ sớm hơn hiện tại trong cùng ngày ⇒ đã qua', () => {
      expect(hasSlotTimePassed('2026-07-25', '08:00', now, TZ)).toBe(true);
    });

    it('mốc giờ muộn hơn hiện tại trong cùng ngày ⇒ chưa qua', () => {
      expect(hasSlotTimePassed('2026-07-25', '20:00', now, TZ)).toBe(false);
    });

    it('ngày quá khứ luôn là đã qua, ngày tương lai luôn là chưa qua', () => {
      expect(hasSlotTimePassed('2026-07-24', '23:59', now, TZ)).toBe(true);
      expect(hasSlotTimePassed('2026-07-26', '00:00', now, TZ)).toBe(false);
    });
  });
});
