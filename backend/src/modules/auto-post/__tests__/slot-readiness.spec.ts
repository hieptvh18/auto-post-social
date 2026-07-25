import { SlotReadiness, resolveSlotReadiness } from '../slot-readiness';

const base = {
  readyCount: 5,
  assignedPendingCount: 5,
  slotEnabled: true,
  pageAutopostEnabled: true,
  pageIsActive: true,
};

describe('resolveSlotReadiness', () => {
  it('còn bài khớp ⇒ READY, không cảnh báo gì', () => {
    const result = resolveSlotReadiness(base);

    expect(result.status).toBe(SlotReadiness.READY);
    expect(result.message).toBeNull();
  });

  it('hết bài vì page CHƯA được phân bổ bài nào ⇒ NO_ASSIGNMENT + chỉ chỗ sửa', () => {
    const result = resolveSlotReadiness({
      ...base,
      readyCount: 0,
      assignedPendingCount: 0,
    });

    expect(result.status).toBe(SlotReadiness.NO_ASSIGNMENT);
    expect(result.message).toContain('Phân bổ page');
  });

  it('page có bài chờ nhưng không khớp danh mục/loại media ⇒ NO_MATCH kèm số bài đang chờ', () => {
    const result = resolveSlotReadiness({
      ...base,
      readyCount: 0,
      assignedPendingCount: 4,
    });

    expect(result.status).toBe(SlotReadiness.NO_MATCH);
    expect(result.message).toContain('4 bài');
  });

  it('page tạm dừng ⇒ PAUSED, ưu tiên báo nguyên nhân gốc thay vì đếm kho', () => {
    const result = resolveSlotReadiness({ ...base, pageIsActive: false });

    expect(result.status).toBe(SlotReadiness.PAUSED);
    expect(result.message).toContain('tạm dừng');
  });

  it('page tắt đăng tự động ⇒ PAUSED kể cả khi kho đầy bài', () => {
    const result = resolveSlotReadiness({
      ...base,
      pageAutopostEnabled: false,
    });

    expect(result.status).toBe(SlotReadiness.PAUSED);
    expect(result.message).toContain('tắt đăng tự động');
  });

  it('mốc giờ bị tắt ⇒ PAUSED', () => {
    const result = resolveSlotReadiness({ ...base, slotEnabled: false });

    expect(result.status).toBe(SlotReadiness.PAUSED);
    expect(result.message).toContain('Mốc giờ');
  });

  it('vừa tắt vừa hết bài ⇒ báo PAUSED trước (sửa cái này mới tới cái kia)', () => {
    const result = resolveSlotReadiness({
      ...base,
      readyCount: 0,
      assignedPendingCount: 0,
      slotEnabled: false,
    });

    expect(result.status).toBe(SlotReadiness.PAUSED);
  });
});
