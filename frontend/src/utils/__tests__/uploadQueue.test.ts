import { describe, expect, it } from 'vitest';
import {
  hasUnfinishedUpload,
  pickNextPending,
  type LocalUpload,
  type LocalUploadStatus,
} from '../uploadQueue';

const make = (id: string, status: LocalUploadStatus): LocalUpload => ({
  id,
  status,
  percent: 0,
  title: `Bài ${id}`,
  category: 'Review',
  filename: `${id}.mp4`,
  fileCount: 1,
  totalSize: 1024,
  createdAt: '2026-08-07T10:00:00.000Z',
  body: { title: `Bài ${id}`, category: 'Review', caption: 'x' },
});

describe('pickNextPending', () => {
  it('lấp đầy đúng số suất còn trống', () => {
    const uploads = [
      make('a', 'SENDING'),
      make('b', 'PENDING'),
      make('c', 'PENDING'),
      make('d', 'PENDING'),
    ];

    expect(pickNextPending(uploads, 3)).toEqual(['b', 'c']);
  });

  it('đã chạy đủ trần ⇒ không cho thêm ai chạy', () => {
    const uploads = [
      make('a', 'SENDING'),
      make('b', 'SENDING'),
      make('c', 'PENDING'),
    ];

    expect(pickNextPending(uploads, 2)).toEqual([]);
  });

  it('giữ đúng thứ tự xếp hàng (vào trước chạy trước)', () => {
    const uploads = [make('a', 'PENDING'), make('b', 'PENDING')];

    expect(pickNextPending(uploads, 1)).toEqual(['a']);
  });

  it('bỏ qua lượt đã lỗi — chỉ chạy lại khi người dùng bấm "Thử lại"', () => {
    const uploads = [make('a', 'FAILED'), make('b', 'PENDING')];

    expect(pickNextPending(uploads, 2)).toEqual(['b']);
  });

  it('danh sách rỗng ⇒ không có gì để chạy', () => {
    expect(pickNextPending([], 2)).toEqual([]);
  });
});

describe('hasUnfinishedUpload', () => {
  it('còn lượt đang gửi hoặc đang chờ ⇒ true (để cảnh báo trước khi rời trang)', () => {
    expect(hasUnfinishedUpload([make('a', 'SENDING')])).toBe(true);
    expect(hasUnfinishedUpload([make('a', 'PENDING')])).toBe(true);
  });

  it('chỉ còn lượt đã lỗi ⇒ false: không có byte nào đang đi, rời trang không mất gì thêm', () => {
    expect(hasUnfinishedUpload([make('a', 'FAILED')])).toBe(false);
  });

  it('rỗng ⇒ false', () => {
    expect(hasUnfinishedUpload([])).toBe(false);
  });
});
