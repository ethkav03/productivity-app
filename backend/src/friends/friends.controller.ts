import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
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
