import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/** Từ mã này trở lên là lỗi hệ thống — log kèm stack. */
const SERVER_ERROR_THRESHOLD = 500;

export interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  correlationId: string;
}

/** Trả lỗi đúng format docs/04-api-spec.md §12 cho mọi exception. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = this.resolveCorrelationId(request);

    const { statusCode, message, error } = this.normalize(exception);

    if (statusCode >= SERVER_ERROR_THRESHOLD) {
      // Lỗi hệ thống: log nguyên stack để điều tra.
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode} [${correlationId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${statusCode} [${correlationId}]: ${JSON.stringify(message)}`,
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      message,
      error,
      correlationId,
    };
    response.status(statusCode).json(body);
  }

  private resolveCorrelationId(request: Request): string {
    const header = request.headers[CORRELATION_ID_HEADER];
    if (typeof header === 'string' && header.length > 0) return header;
    if (Array.isArray(header) && header.length > 0) return header[0];
    return 'unknown';
  }

  private normalize(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { statusCode, message: payload, error: exception.name };
      }

      const record = payload as Record<string, unknown>;
      const message = (record.message ?? exception.message) as
        string | string[];
      const error = (record.error ?? exception.name) as string;
      return { statusCode, message, error };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi hệ thống',
      error: 'Internal Server Error',
    };
  }
}
