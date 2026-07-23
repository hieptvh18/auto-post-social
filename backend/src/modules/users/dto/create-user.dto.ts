import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';
import { UserRole } from '../../../../generated/prisma/client';

/** Email luôn lowercase + trim để `@unique` không bị lách bằng hoa/thường. */
export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ example: 'content@company.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'TempPass123!', minLength: 8 })
  @IsString()
  @Length(8, 72)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.CONTENT })
  @IsEnum(UserRole)
  role!: UserRole;
}
