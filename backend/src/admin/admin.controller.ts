import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminAdjustXpDto } from './dto/admin-adjust-xp.dto';
import { AdminCreateFriendshipDto } from './dto/admin-create-friendship.dto';
import { AdminGrantAchievementDto } from './dto/admin-grant-achievement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query('search') search?: string) {
    return this.adminService.listUsers(search);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  updateUser(@CurrentUser() caller: AuthenticatedUser, @Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.adminService.updateUser(id, caller.userId, dto);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() caller: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.deleteUser(id, caller.userId);
  }

  @Post('users/:id/xp')
  @HttpCode(200)
  adjustXp(@Param('id') id: string, @Body() dto: AdminAdjustXpDto) {
    return this.adminService.adjustXp(id, dto);
  }

  @Post('users/:id/achievements')
  grantAchievement(@Param('id') id: string, @Body() dto: AdminGrantAchievementDto) {
    return this.adminService.grantAchievement(id, dto.achievementId);
  }

  @Delete('users/:id/achievements/:achievementId')
  revokeAchievement(@Param('id') id: string, @Param('achievementId') achievementId: string) {
    return this.adminService.revokeAchievement(id, achievementId);
  }

  @Get('achievements')
  listAchievements() {
    return this.adminService.listAchievements();
  }

  @Get('friendships')
  listFriendships() {
    return this.adminService.listFriendships();
  }

  @Post('friendships')
  createFriendship(@Body() dto: AdminCreateFriendshipDto) {
    return this.adminService.createFriendship(dto);
  }

  @Patch('friendships/:id/accept')
  acceptFriendship(@Param('id') id: string) {
    return this.adminService.acceptFriendship(id);
  }

  @Delete('friendships/:id')
  deleteFriendship(@Param('id') id: string) {
    return this.adminService.deleteFriendship(id);
  }
}
