import type { ReupRunStatus } from '../../../generated/prisma/client';
import type { ReupRunWithTopic } from './reup-runs.repository';

export interface ReupRunResponse {
  id: string;
  topicId: string;
  topic: { id: string; name: string };
  runDate: string;
  status: ReupRunStatus;
  foundCount: number;
  pickedCount: number;
  quotaUsed: number;
  skipReason: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export function toReupRunResponse(run: ReupRunWithTopic): ReupRunResponse {
  return {
    id: run.id,
    topicId: run.topicId,
    topic: { id: run.topic.id, name: run.topic.name },
    runDate: run.runDate,
    status: run.status,
    foundCount: run.foundCount,
    pickedCount: run.pickedCount,
    quotaUsed: run.quotaUsed,
    skipReason: run.skipReason,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}
