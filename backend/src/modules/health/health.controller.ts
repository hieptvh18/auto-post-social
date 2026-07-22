import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { LivenessResult, ReadinessResult } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness — app còn sống' })
  @ApiOkResponse({ description: 'App đang chạy' })
  liveness(): LivenessResult {
    return this.healthService.liveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness — kiểm tra DB và Redis' })
  @ApiOkResponse({ description: 'Trạng thái từng dependency' })
  readiness(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }
}
