import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FriendshipStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AdminCreateFriendshipDto {
  @ApiProperty()
  @IsString()
  requesterUsername!: string;

  @ApiProperty()
  @IsString()
  addresseeUsername!: string;

  @ApiPropertyOptional({ enum: FriendshipStatus, description: 'Defaults to ACCEPTED - the point of the admin tool is to skip the request dance.' })
  @IsOptional()
  @IsEnum(FriendshipStatus)
  status?: FriendshipStatus;
}
