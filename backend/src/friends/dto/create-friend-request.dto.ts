import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFriendRequestDto {
  @ApiProperty({ description: 'Exact username of the person to send a friend request to.' })
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  username!: string;
}
