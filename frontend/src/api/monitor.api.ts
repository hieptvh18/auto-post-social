import type { QueueSummary } from '../types';
import { apiRequest } from './client';

export const monitorApi = {
  /** GET /monitor/queue/summary — số liệu BullMQ + DB + job kẹt (ADMIN). */
  getQueueSummary(): Promise<QueueSummary> {
    return apiRequest<QueueSummary>('/monitor/queue/summary');
  },
};
