import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  PublishJobEventType,
  type PublishJobEvent,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateEventData {
  publishJobId: string;
  attemptNo: number;
  event: PublishJobEventType;
  message?: string;
  rawError?: Prisma.InputJsonValue;
}

/** Nơi duy nhất viết Prisma query cho `publish_job_events` (rule 01). */
@Injectable()
export class PublishJobEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateEventData): Promise<PublishJobEvent> {
    return this.prisma.publishJobEvent.create({
      data: {
        publishJobId: data.publishJobId,
        attemptNo: data.attemptNo,
        event: data.event,
        message: data.message ?? null,
        rawError: data.rawError,
      },
    });
  }

  findByJobId(publishJobId: string): Promise<PublishJobEvent[]> {
    return this.prisma.publishJobEvent.findMany({
      where: { publishJobId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
