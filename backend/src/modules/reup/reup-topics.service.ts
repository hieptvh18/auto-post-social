import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReupPlatform, type ReupTopic } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { CreateReupTopicDto } from './dto/create-reup-topic.dto';
import type { QueryReupTopicsDto } from './dto/query-reup-topics.dto';
import type { UpdateReupTopicDto } from './dto/update-reup-topic.dto';
import {
  toReupTopicResponse,
  type ReupTopicResponse,
} from './reup-topic.mapper';
import {
  ReupTopicsRepository,
  type UpdateReupTopicData,
} from './reup-topics.repository';

export interface PaginatedReupTopics {
  data: ReupTopicResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Trần số chủ đề ĐANG BẬT (plan 29 §3.2). Mỗi chủ đề tiêu 100 quota units cho
 * một lần `search.list`, trần YouTube là 10.000/ngày — 20 chủ đề = 2.000 units,
 * còn dư nhiều cho nút "Quét ngay" bấm tay.
 */
export const MAX_ACTIVE_REUP_TOPICS = 20;

const DEFAULTS = {
  platform: ReupPlatform.YOUTUBE,
  regionCode: 'VN',
  dailyQuota: 3,
  minViewCount: 50_000,
  maxAgeDays: 30,
  minDurationSec: 15,
  maxDurationSec: 180,
  autoApprove: false,
  isActive: true,
} as const;

@Injectable()
export class ReupTopicsService {
  constructor(
    private readonly repository: ReupTopicsRepository,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryReupTopicsDto): Promise<PaginatedReupTopics> {
    const { data, total } = await this.repository.findMany({
      platform: query.platform,
      isActive: query.isActive,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map(toReupTopicResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<ReupTopicResponse> {
    return toReupTopicResponse(await this.getOrFail(id));
  }

  async create(
    dto: CreateReupTopicDto,
    actor: AuthenticatedUser,
  ): Promise<ReupTopicResponse> {
    const platform = dto.platform ?? DEFAULTS.platform;
    const keywords = normalizeKeywords(dto.keywords);
    const name = dto.name.trim();

    this.assertKeywordsPresent(platform, keywords);
    this.assertDurationRange(
      dto.minDurationSec ?? DEFAULTS.minDurationSec,
      dto.maxDurationSec ?? DEFAULTS.maxDurationSec,
    );

    const isActive = dto.isActive ?? DEFAULTS.isActive;
    if (isActive) await this.assertActiveTopicLimit();

    const duplicate = await this.repository.findByNameAndPlatform(
      name,
      platform,
    );
    if (duplicate !== null) {
      throw new ConflictException(
        `Chủ đề "${name}" trên nền tảng này đã tồn tại`,
      );
    }

    const created = await this.repository.create({
      name,
      platform,
      keywords,
      regionCode: dto.regionCode ?? DEFAULTS.regionCode,
      category: dto.category.trim(),
      dailyQuota: dto.dailyQuota ?? DEFAULTS.dailyQuota,
      minViewCount: dto.minViewCount ?? DEFAULTS.minViewCount,
      maxAgeDays: dto.maxAgeDays ?? DEFAULTS.maxAgeDays,
      minDurationSec: dto.minDurationSec ?? DEFAULTS.minDurationSec,
      maxDurationSec: dto.maxDurationSec ?? DEFAULTS.maxDurationSec,
      autoApprove: dto.autoApprove ?? DEFAULTS.autoApprove,
      captionTemplate: dto.captionTemplate ?? null,
      hashtags: dto.hashtags ?? null,
      isActive,
      createdById: actor.id,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.REUP_TOPIC_CREATE,
      resource: `reup_topic:${created.id}`,
      afterValue: {
        name: created.name,
        platform: created.platform,
        category: created.category,
        dailyQuota: created.dailyQuota,
        autoApprove: created.autoApprove,
      },
    });

    return toReupTopicResponse(created);
  }

  async update(
    id: string,
    dto: UpdateReupTopicDto,
    actor: AuthenticatedUser,
  ): Promise<ReupTopicResponse> {
    const current = await this.getOrFail(id);

    const platform = dto.platform ?? current.platform;
    const name = dto.name === undefined ? current.name : dto.name.trim();
    const keywords =
      dto.keywords === undefined
        ? current.keywords
        : normalizeKeywords(dto.keywords);

    this.assertKeywordsPresent(platform, keywords);
    // Ràng buộc chéo phải kiểm trên GIÁ TRỊ SAU KHI GỘP: PATCH chỉ gửi
    // `maxDurationSec` thì so với `minDurationSec` cũ trong DB mới đúng.
    this.assertDurationRange(
      dto.minDurationSec ?? current.minDurationSec,
      dto.maxDurationSec ?? current.maxDurationSec,
    );

    // Chỉ đếm lại trần khi chủ đề chuyển từ TẮT sang BẬT.
    if (dto.isActive === true && !current.isActive) {
      await this.assertActiveTopicLimit();
    }

    if (name !== current.name || platform !== current.platform) {
      const duplicate = await this.repository.findByNameAndPlatform(
        name,
        platform,
      );
      if (duplicate !== null && duplicate.id !== id) {
        throw new ConflictException(
          `Chủ đề "${name}" trên nền tảng này đã tồn tại`,
        );
      }
    }

    const data: UpdateReupTopicData = {
      name: dto.name === undefined ? undefined : name,
      platform: dto.platform,
      keywords: dto.keywords === undefined ? undefined : keywords,
      regionCode: dto.regionCode,
      category: dto.category?.trim(),
      dailyQuota: dto.dailyQuota,
      minViewCount: dto.minViewCount,
      maxAgeDays: dto.maxAgeDays,
      minDurationSec: dto.minDurationSec,
      maxDurationSec: dto.maxDurationSec,
      autoApprove: dto.autoApprove,
      captionTemplate: dto.captionTemplate,
      hashtags: dto.hashtags,
      isActive: dto.isActive,
    };

    const updated = await this.repository.update(id, data);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.REUP_TOPIC_UPDATE,
      resource: `reup_topic:${id}`,
      beforeValue: {
        name: current.name,
        isActive: current.isActive,
        autoApprove: current.autoApprove,
        dailyQuota: current.dailyQuota,
      },
      afterValue: {
        name: updated.name,
        isActive: updated.isActive,
        autoApprove: updated.autoApprove,
        dailyQuota: updated.dailyQuota,
      },
    });

    return toReupTopicResponse(updated);
  }

  /**
   * **Soft delete** — chỉ tắt `isActive`. Giữ bản ghi vì `reup_videos` trỏ vào
   * nó bằng FK CASCADE: xoá cứng là mất luôn lịch sử video đã kéo, và mất cả
   * `external_id` đang dùng để chống tải trùng.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getOrFail(id);
    await this.repository.update(id, { isActive: false });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.REUP_TOPIC_DELETE,
      resource: `reup_topic:${id}`,
      beforeValue: { name: current.name, isActive: current.isActive },
      afterValue: { isActive: false },
    });
  }

  private async getOrFail(id: string): Promise<ReupTopic> {
    const topic = await this.repository.findById(id);
    if (topic === null) {
      throw new NotFoundException('Không tìm thấy chủ đề reup');
    }
    return topic;
  }

  /** Không có keyword thì cron YouTube không biết tìm bằng gì (plan 27 §3.3). */
  private assertKeywordsPresent(
    platform: ReupPlatform,
    keywords: string[],
  ): void {
    if (platform === ReupPlatform.YOUTUBE && keywords.length === 0) {
      throw new BadRequestException(
        'Chủ đề YouTube phải có ít nhất 1 từ khoá tìm kiếm',
      );
    }
  }

  private assertDurationRange(minSec: number, maxSec: number): void {
    if (minSec >= maxSec) {
      throw new BadRequestException(
        'Thời lượng tối thiểu phải nhỏ hơn thời lượng tối đa',
      );
    }
  }

  private async assertActiveTopicLimit(): Promise<void> {
    const active = await this.repository.countActive();
    if (active >= MAX_ACTIVE_REUP_TOPICS) {
      throw new UnprocessableEntityException(
        `Chỉ được bật tối đa ${MAX_ACTIVE_REUP_TOPICS} chủ đề cùng lúc — hãy tắt bớt chủ đề khác trước`,
      );
    }
  }
}

/** Bỏ khoảng trắng thừa, bỏ chuỗi rỗng, khử trùng lặp — giữ nguyên thứ tự. */
function normalizeKeywords(keywords: string[] | undefined): string[] {
  if (keywords === undefined) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (keyword === '') continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}
