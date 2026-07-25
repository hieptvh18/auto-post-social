import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateManualPostDto } from './dto/create-manual-post.dto';
import {
  ManualPostService,
  type ManualPostResult,
} from './manual-post.service';

@ApiTags('manual-post')
@ApiBearerAuth()
@Controller('manual-post')
@RequirePermission('autopost:manage')
export class ManualPostController {
  constructor(private readonly service: ManualPostService) {}

  @Post()
  @ApiOperation({
    summary: 'Đăng ngay một bài lên một Page (đồng bộ, không qua cron/queue)',
  })
  publishNow(
    @Body() dto: CreateManualPostDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ManualPostResult> {
    return this.service.publishNow(dto, actor);
  }
}
