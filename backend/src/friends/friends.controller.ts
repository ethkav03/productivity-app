import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FriendsService } from './friends.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listFriends(user.userId);
  }

  @Get('requests')
  listRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listRequests(user.userId);
  }

  @Get('suggestions')
  getSuggestions(@CurrentUser() user: AuthenticatedUser, @Query('limit') limitParam?: string) {
    const limit = Math.min(20, Math.max(1, parseInt(limitParam ?? '6', 10) || 6));
    return this.friendsService.getSuggestions(user.userId, limit);
  }

  @Post('requests')
  sendRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFriendRequestDto) {
    return this.friendsService.sendRequest(user.userId, dto.username);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  acceptRequest(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.friendsService.acceptRequest(user.userId, id);
  }

  @Delete('requests/:id')
  declineOrCancelRequest(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.friendsService.removeFriendship(user.userId, id);
  }

  @Delete(':id')
  removeFriend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.friendsService.removeFriendship(user.userId, id);
  }
}
