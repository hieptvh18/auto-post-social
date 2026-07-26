import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SlotMediaType } from '../../../../generated/prisma/client';
import { CreateAutoPostSlotDto } from '../dto/create-auto-post-slot.dto';

const validPayload = {
  time: '08:00',
  categories: ['Cơ xương khớp'],
  mediaType: SlotMediaType.all,
  postCount: 1,
};

function errorsOf(payload: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateAutoPostSlotDto, payload);
  return validateSync(dto).map((e) => e.property);
}

describe('CreateAutoPostSlotDto', () => {
  it('payload hợp lệ ⇒ không lỗi', () => {
    expect(errorsOf(validPayload)).toEqual([]);
  });

  it.each(['25:00', '8:00', '08:60', '0800', ''])(
    'time không hợp lệ "%s" ⇒ lỗi',
    (time) => {
      expect(errorsOf({ ...validPayload, time })).toContain('time');
    },
  );

  it.each(['00:00', '23:59', '09:05'])('time hợp lệ "%s"', (time) => {
    expect(errorsOf({ ...validPayload, time })).toEqual([]);
  });

  it('categories rỗng ⇒ lỗi', () => {
    expect(errorsOf({ ...validPayload, categories: [] })).toContain(
      'categories',
    );
  });

  it('gửi 2 danh mục ⇒ lỗi (mỗi mốc giờ chỉ 1 dạng bài)', () => {
    expect(
      errorsOf({ ...validPayload, categories: ['Marketing', 'Thăm khám'] }),
    ).toContain('categories');
  });

  it('mediaType ngoài image/video/all ⇒ lỗi', () => {
    expect(errorsOf({ ...validPayload, mediaType: 'gif' })).toContain(
      'mediaType',
    );
  });

  it.each([0, -1, 1.5])('postCount không hợp lệ %s ⇒ lỗi', (postCount) => {
    expect(errorsOf({ ...validPayload, postCount })).toContain('postCount');
  });
});
