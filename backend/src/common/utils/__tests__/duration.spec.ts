import { parseDurationToSeconds } from '../duration';

describe('parseDurationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
    ['900', 900],
    ['  15m  ', 900],
  ])('đổi %s thành %i giây', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', 'abc', '15x', '-5m', '1.5h'])(
    'ném lỗi với chuỗi không hợp lệ: %s',
    (input) => {
      expect(() => parseDurationToSeconds(input)).toThrow(
        'Chuỗi thời hạn không hợp lệ',
      );
    },
  );
});
