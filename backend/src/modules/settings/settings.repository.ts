import { Injectable } from '@nestjs/common';
import type { AppSetting, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { SettingKeyValue } from './settings.types';

/** Nơi duy nhất viết Prisma query cho bảng app_settings (rule 01). */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(key: SettingKeyValue): Promise<AppSetting | null> {
    return this.prisma.appSetting.findUnique({ where: { key } });
  }

  /** Upsert vì mỗi nhóm config chỉ có đúng 1 dòng. `updatedById = null` ⇒ hệ thống ghi. */
  upsert(
    key: SettingKeyValue,
    value: Prisma.InputJsonValue,
    updatedById: string | null,
  ): Promise<AppSetting> {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value, updatedById },
      update: { value, updatedById },
    });
  }
}
