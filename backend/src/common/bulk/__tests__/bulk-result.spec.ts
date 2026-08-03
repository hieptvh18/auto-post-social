import { ConflictException } from '@nestjs/common';
import { BulkItemError, runBulkSequential } from '../bulk-result';

describe('runBulkSequential', () => {
  it('chạy đúng thứ tự và gom id thành công', async () => {
    const seen: string[] = [];

    const result = await runBulkSequential(['a', 'b', 'c'], async (id) => {
      seen.push(id);
      await Promise.resolve();
    });

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({
      requested: 3,
      succeeded: ['a', 'b', 'c'],
      failed: [],
    });
  });

  it('một item hỏng không dừng cả lô', async () => {
    const result = await runBulkSequential(['a', 'b', 'c'], async (id) => {
      await Promise.resolve();
      if (id === 'b') throw new ConflictException('Đang bận');
    });

    expect(result.succeeded).toEqual(['a', 'c']);
    expect(result.failed).toEqual([
      { id: 'b', label: 'b', reason: 'Đang bận' },
    ]);
  });

  it('BulkItemError mang theo nhãn để UI biết record nào hỏng', async () => {
    const result = await runBulkSequential(['a'], async () => {
      await Promise.resolve();
      throw new BulkItemError('Video khai trương', 'Bài đã đăng');
    });

    expect(result.failed[0]).toEqual({
      id: 'a',
      label: 'Video khai trương',
      reason: 'Bài đã đăng',
    });
  });

  it('Error rỗng message vẫn có lý do đọc được', async () => {
    const result = await runBulkSequential(['a'], () =>
      Promise.reject(new Error('')),
    );

    expect(result.failed[0].reason).toBe('Lỗi không xác định');
  });

  it('lỗi lạ (không phải Error) vẫn có lý do đọc được', async () => {
    // Mô phỏng thư viện ngoài reject bằng string — helper không được sập vì thế.
    const rejectWithString: () => Promise<void> = () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject('toang');

    const result = await runBulkSequential(['a'], rejectWithString);

    expect(result.failed[0].reason).toBe('Lỗi không xác định');
  });

  it('danh sách rỗng ⇒ không gọi handler', async () => {
    const handler = jest.fn();

    const result = await runBulkSequential([], handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({ requested: 0, succeeded: [], failed: [] });
  });
});
