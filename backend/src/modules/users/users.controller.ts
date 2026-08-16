import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponse } from './user.mapper';
import { UsersService, type PaginatedUsers } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@RequirePermission('users:manage')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng (ADMIN)' })
  findAll(@Query() query: QueryUsersDto): Promise<PaginatedUsers> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết người dùng (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo người dùng (ADMIN)' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.create(dto, actor);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật người dùng (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Vô hiệu hóa người dùng — soft delete (ADMIN)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.remove(id, actor);
  }
}
