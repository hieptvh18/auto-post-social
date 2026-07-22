import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from '../http-exception.filter';
import { CORRELATION_ID_HEADER } from '../../middleware/correlation-id.middleware';

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let captured: Captured;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  const buildHost = (headers: Record<string, unknown> = {}): ArgumentsHost => {
    const json = jest.fn((body: Record<string, unknown>) => {
      captured.body = body;
    });
    const status = jest.fn((code: number) => {
      captured.status = code;
      return { json };
    });

    return {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/api/test', headers }),
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    filter = new HttpExceptionFilter();
    captured = { status: 0, body: {} };
  });

  describe('mã lỗi theo docs/04 §13', () => {
    it.each([
      [new BadRequestException('thiếu rejectComment'), HttpStatus.BAD_REQUEST],
      [
        new ForbiddenException('CONTENT không được đổi status'),
        HttpStatus.FORBIDDEN,
      ],
      [new NotFoundException('không tìm thấy content'), HttpStatus.NOT_FOUND],
      [
        new ConflictException('assignment trùng content x page'),
        HttpStatus.CONFLICT,
      ],
      [
        new UnprocessableEntityException('PUBLISHING chỉ Bot được set'),
        HttpStatus.UNPROCESSABLE_ENTITY,
      ],
    ])('map %#: trả về đúng statusCode %s', (exception, expectedStatus) => {
      filter.catch(exception, buildHost({ [CORRELATION_ID_HEADER]: 'cid-1' }));

      expect(captured.status).toBe(expectedStatus);
      expect(captured.body.statusCode).toBe(expectedStatus);
      expect(captured.body.correlationId).toBe('cid-1');
    });
  });

  describe('chuẩn hoá payload', () => {
    it('giữ mảng message từ ValidationPipe', () => {
      const exception = new BadRequestException({
        statusCode: 400,
        message: ['caption should not be empty', 'category must be a string'],
        error: 'Bad Request',
      });

      filter.catch(exception, buildHost());

      expect(captured.body.message).toEqual([
        'caption should not be empty',
        'category must be a string',
      ]);
      expect(captured.body.error).toBe('Bad Request');
    });

    it('xử lý HttpException có payload là chuỗi', () => {
      filter.catch(
        new HttpException('lỗi dạng chuỗi', HttpStatus.BAD_REQUEST),
        buildHost(),
      );

      expect(captured.body.message).toBe('lỗi dạng chuỗi');
      expect(captured.body.error).toBe('HttpException');
    });

    it('dùng message và name của exception khi payload thiếu field', () => {
      filter.catch(
        new HttpException({ foo: 'bar' }, HttpStatus.BAD_REQUEST),
        buildHost(),
      );

      expect(captured.body.message).toBe('Http Exception');
      expect(captured.body.error).toBe('HttpException');
    });

    it('quy lỗi không phải HttpException về 500 và giấu chi tiết', () => {
      filter.catch(new Error('lộ chi tiết nội bộ'), buildHost());

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.message).toBe('Đã xảy ra lỗi hệ thống');
      expect(captured.body.error).toBe('Internal Server Error');
      expect(JSON.stringify(captured.body)).not.toContain('lộ chi tiết nội bộ');
    });

    it('xử lý được giá trị ném ra không phải Error', () => {
      filter.catch('chuỗi trần', buildHost());

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(errorLog).toHaveBeenCalled();
    });
  });

  describe('correlationId', () => {
    it('lấy phần tử đầu khi header là mảng', () => {
      filter.catch(
        new NotFoundException(),
        buildHost({ [CORRELATION_ID_HEADER]: ['cid-a', 'cid-b'] }),
      );

      expect(captured.body.correlationId).toBe('cid-a');
    });

    it('trả về unknown khi không có header', () => {
      filter.catch(new NotFoundException(), buildHost());

      expect(captured.body.correlationId).toBe('unknown');
    });

    it('trả về unknown khi header là mảng rỗng', () => {
      filter.catch(
        new NotFoundException(),
        buildHost({ [CORRELATION_ID_HEADER]: [] }),
      );

      expect(captured.body.correlationId).toBe('unknown');
    });
  });

  describe('log', () => {
    it('log ở mức error cho lỗi 5xx', () => {
      filter.catch(new Error('bùm'), buildHost());

      expect(errorLog).toHaveBeenCalled();
      expect(warnLog).not.toHaveBeenCalled();
    });

    it('log ở mức warn cho lỗi 4xx', () => {
      filter.catch(new NotFoundException(), buildHost());

      expect(warnLog).toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    });
  });
});
