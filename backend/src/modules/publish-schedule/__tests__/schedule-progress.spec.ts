import { PublishStatus } from '../../../../generated/prisma/client';
import {
  resolveSlotProgress,
  type SlotProgressInput,
} from '../schedule-progress';

function input(overrides: Partial<SlotProgressInput> = {}): SlotProgressInput {
  return {
    plannedCount: 2,
    jobStatuses: [],
    readyCount: 5,
    slotPassed: false,
    runnable: true,
    ...overrides,
  };
}

describe('resolveSlotProgress', () => {
  it('PAUSED khi slot/page không chạy được và chưa có job nào', () => {
    expect(resolveSlotProgress(input({ runnable: false }))).toBe('PAUSED');
  });

  it('PENDING khi chưa tới giờ và kho còn bài', () => {
    expect(resolveSlotProgress(input())).toBe('PENDING');
  });

  it('NO_CONTENT khi chưa tới giờ nhưng kho không còn bài hợp lệ', () => {
    expect(resolveSlotProgress(input({ readyCount: 0 }))).toBe('NO_CONTENT');
  });

  it('MISSED khi giờ đã qua mà không có job nào', () => {
    expect(resolveSlotProgress(input({ slotPassed: true }))).toBe('MISSED');
  });

  it('RUNNING khi còn job QUEUED/PUBLISHING dù đã có bài thành công', () => {
    const progress = resolveSlotProgress(
      input({
        jobStatuses: [PublishStatus.SUCCESS, PublishStatus.PUBLISHING],
      }),
    );

    expect(progress).toBe('RUNNING');
  });

  it('DONE khi số bài thành công đạt kế hoạch', () => {
    const progress = resolveSlotProgress(
      input({ jobStatuses: [PublishStatus.SUCCESS, PublishStatus.SUCCESS] }),
    );

    expect(progress).toBe('DONE');
  });

  it('PARTIAL khi đăng được một phần rồi dừng', () => {
    const progress = resolveSlotProgress(
      input({ jobStatuses: [PublishStatus.SUCCESS, PublishStatus.FAILED] }),
    );

    expect(progress).toBe('PARTIAL');
  });

  it('FAILED khi có job lỗi và chưa bài nào thành công', () => {
    const progress = resolveSlotProgress(
      input({ jobStatuses: [PublishStatus.FAILED] }),
    );

    expect(progress).toBe('FAILED');
  });

  it('chỉ còn job CANCELLED thì coi như chưa đăng gì — theo giờ mà kết luận', () => {
    expect(
      resolveSlotProgress(
        input({ jobStatuses: [PublishStatus.CANCELLED], slotPassed: true }),
      ),
    ).toBe('MISSED');
    expect(
      resolveSlotProgress(input({ jobStatuses: [PublishStatus.CANCELLED] })),
    ).toBe('PENDING');
  });

  it('job CANCELLED trên slot đã tắt vẫn báo PAUSED', () => {
    const progress = resolveSlotProgress(
      input({ jobStatuses: [PublishStatus.CANCELLED], runnable: false }),
    );

    expect(progress).toBe('PAUSED');
  });
});
