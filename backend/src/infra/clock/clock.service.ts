import { Injectable } from '@nestjs/common';

/**
 * Lối vào duy nhất để lấy "bây giờ". Có class riêng để test không phụ thuộc giờ
 * chạy thật (rule 01 §Thời gian) — engine auto-post ở plan 07 dùng lại chính nó.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }
}
