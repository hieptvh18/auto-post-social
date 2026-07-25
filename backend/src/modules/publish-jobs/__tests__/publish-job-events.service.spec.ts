import { PublishJobEventType } from '../../../../generated/prisma/client';
import type { PublishJobEventsRepository } from '../publish-job-events.repository';
import {
  PublishJobEventsService,
  sanitizeRawError,
} from '../publish-job-events.service';

describe('sanitizeRawError', () => {
  it('KHÔNG để lọt access token vào nhật ký', () => {
    const result = sanitizeRawError({
      url: 'https://graph.facebook.com/v21.0/111/photos',
      access_token: 'EAAG-token-that-mo-i-that',
      headers: { Authorization: 'Bearer EAAG-token' },
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain('EAAG-token');
    expect(json).toContain('[đã ẩn]');
    expect(json).toContain('graph.facebook.com');
  });

  it('che cả khoá lồng sâu và biến thể tên (refresh_token, clientSecret, password)', () => {
    const result = sanitizeRawError({
      level1: {
        level2: {
          refresh_token: 'r-secret',
          clientSecret: 'c-secret',
          password: 'p-secret',
        },
      },
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain('r-secret');
    expect(json).not.toContain('c-secret');
    expect(json).not.toContain('p-secret');
  });

  it('giữ name + message của Error để còn biết hỏng vì cái gì', () => {
    const result = sanitizeRawError(new Error('Graph trả về 500'));

    expect(result).toEqual({ name: 'Error', message: 'Graph trả về 500' });
  });

  it('cắt chuỗi quá dài để không phình cột jsonb', () => {
    const result = sanitizeRawError({ body: 'x'.repeat(5000) });

    const body = (result as { body: string }).body;
    expect(body.length).toBeLessThan(2100);
  });

  it('chặn đệ quy quá sâu thay vì đi mãi', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'đáy' } } } } } };

    expect(() => sanitizeRawError(deep)).not.toThrow();
    expect(JSON.stringify(sanitizeRawError(deep))).toContain('quá sâu');
  });
});

describe('PublishJobEventsService', () => {
  let repository: jest.Mocked<Pick<PublishJobEventsRepository, 'create'>>;
  let service: PublishJobEventsService;

  beforeEach(() => {
    repository = { create: jest.fn().mockResolvedValue({}) };
    service = new PublishJobEventsService(
      repository as unknown as PublishJobEventsRepository,
    );
  });

  it('ghi đúng job, lần thử và loại sự kiện', async () => {
    await service.log({
      publishJobId: 'job-1',
      attemptNo: 2,
      event: PublishJobEventType.RETRY_SCHEDULED,
      message: 'Sẽ thử lại (lần 3)',
    });

    const arg = repository.create.mock.calls[0][0];
    expect(arg.publishJobId).toBe('job-1');
    expect(arg.attemptNo).toBe(2);
    expect(arg.event).toBe(PublishJobEventType.RETRY_SCHEDULED);
  });

  it('lỗi ghi log KHÔNG được làm hỏng luồng đăng bài', async () => {
    repository.create.mockRejectedValue(new Error('DB down'));

    await expect(
      service.log({
        publishJobId: 'job-1',
        attemptNo: 1,
        event: PublishJobEventType.STARTED,
      }),
    ).resolves.toBeUndefined();
  });
});
