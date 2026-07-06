# 08 — BullMQ

> Queue, worker, retry, dead letter — v2.0

---

## 1. Queue Design

| Queue | Mô tả |
|-------|-------|
| `publish-facebook` | Delay job publish lên Facebook |

**Không dùng queue riêng cho upload** — upload đồng bộ qua API.

---

## 2. Job Payload

```typescript
interface PublishFacebookJobData {
  publishJobId: string;
}
```

Worker load full context từ DB: content, page, caption, drive_file_id.

---

## 3. Enqueue on Schedule

```typescript
const delayMs = Math.max(0, scheduleTime.getTime() - Date.now());

const bullJob = await publishQueue.add(
  'publish-facebook',
  { publishJobId: job.id },
  {
    delay: delayMs,
    jobId: `publish-${job.id}`,       // idempotent add
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: false,
  },
);

await publishJobsRepo.update(job.id, {
  status: 'QUEUED',
  bullJobId: bullJob.id,
});
```

---

## 4. Worker Processor

```typescript
@Processor('publish-facebook')
export class PublishFacebookProcessor extends WorkerHost {
  async process(job: Job<PublishFacebookJobData>) {
    const { publishJobId } = job.data;
    await this.publishService.execute(publishJobId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    if (job.attemptsMade >= job.opts.attempts) {
      await this.publishJobsRepo.update(publishJobId, {
        status: 'FAILED',
        errorMessage: error.message,
      });
      // optional: move to DLQ
    }
  }
}
```

---

## 5. Retry Strategy

| Layer | Strategy |
|-------|----------|
| BullMQ auto | 3 attempts, exponential backoff 60s |
| Manual retry | PUBLISHER/ADMIN → `POST /publish-jobs/:id/retry` |
| Reconciliation | Cron 5 phút — jobs QUEUED/SCHEDULED missing in Redis |

### Manual retry

```typescript
async retry(publishJobId: string) {
  const job = await this.repo.findById(publishJobId);
  if (!['FAILED', 'CANCELLED'].includes(job.status)) throw ConflictException;

  await this.queue.add(..., { delay: 0 });
  await this.repo.update(publishJobId, {
    status: 'QUEUED',
    errorMessage: null,
    attemptCount: 0,
  });
}
```

---

## 6. Dead Letter Queue

Sau max attempts, job failed permanently:

```typescript
// Option A: status FAILED in DB (primary source)
// Option B: move to DLQ queue for admin review

await deadLetterQueue.add('publish-failed', {
  publishJobId,
  originalError: error.message,
  attemptsMade: job.attemptsMade,
});
```

UI **Failed Jobs** page: list `publish_jobs WHERE status = FAILED`.

---

## 7. Cancel & Reschedule

### Cancel

```typescript
async cancel(publishJobId: string) {
  const job = await this.repo.findById(publishJobId);
  if (job.bullJobId) {
    const bullJob = await this.queue.getJob(job.bullJobId);
    await bullJob?.remove();
  }
  await this.repo.update(publishJobId, { status: 'CANCELLED' });
}
```

### Reschedule

```typescript
async reschedule(publishJobId: string, newTime: Date) {
  await this.cancel(publishJobId); // remove old bull job
  await this.repo.update(publishJobId, { scheduleTime: newTime, status: 'SCHEDULED' });
  await this.enqueue(publishJobId, newTime);
}
```

---

## 8. Reconciliation Cron

```typescript
@Cron('*/5 * * * *')
async reconcileStuckJobs() {
  const stuck = await this.repo.findStuck({
    statuses: ['SCHEDULED', 'QUEUED'],
    scheduleTimeBefore: subMinutes(new Date(), 5),
  });
  for (const job of stuck) {
    await this.enqueue(job.id, job.scheduleTime);
  }
}
```

---

## 9. Queue Monitor API

`GET /queue/jobs` — aggregate BullMQ counts:

```typescript
const [waiting, active, delayed, failed] = await Promise.all([
  queue.getWaitingCount(),
  queue.getActiveCount(),
  queue.getDelayedCount(),
  queue.getFailedCount(),
]);
```

---

## 10. Redis Config

```env
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # production
```

Docker Compose: Redis 7 với persistence (`appendonly yes`).

---

## 11. Scaling

- N worker processes cùng consume `publish-facebook`
- BullMQ đảm bảo mỗi job chỉ 1 worker xử lý
- DB optimistic lock `QUEUED → PUBLISHING` chống double publish

---

## 12. Implementation Checklist

- [ ] `BullModule.registerQueue({ name: 'publish-facebook' })`
- [ ] Enqueue on create/reschedule
- [ ] Worker process riêng (`worker/` app)
- [ ] Failed handler + DB status sync
- [ ] Cancel removes Bull job
- [ ] Reconciliation cron
- [ ] Queue monitor endpoint
