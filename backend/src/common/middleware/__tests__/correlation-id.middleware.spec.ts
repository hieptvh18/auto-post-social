import type { NextFunction, Request, Response } from 'express';
import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from '../correlation-id.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let res: { setHeader: jest.Mock };
  let next: NextFunction;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    res = { setHeader: jest.fn() };
    next = jest.fn();
  });

  it('sinh correlationId mới khi request không gửi header', () => {
    const req = { headers: {} } as unknown as Request;

    middleware.use(req, res as unknown as Response, next);

    const generated = req.headers[CORRELATION_ID_HEADER];
    expect(generated).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      generated,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('giữ nguyên correlationId do client gửi lên', () => {
    const req = {
      headers: { [CORRELATION_ID_HEADER]: 'trace-abc' },
    } as unknown as Request;

    middleware.use(req, res as unknown as Response, next);

    expect(req.headers[CORRELATION_ID_HEADER]).toBe('trace-abc');
    expect(res.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      'trace-abc',
    );
  });

  it('sinh mới khi header rỗng', () => {
    const req = {
      headers: { [CORRELATION_ID_HEADER]: '' },
    } as unknown as Request;

    middleware.use(req, res as unknown as Response, next);

    expect(req.headers[CORRELATION_ID_HEADER]).toMatch(UUID_PATTERN);
  });
});
