import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SeasonStatus } from '@prisma/client';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('seasons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: SeasonStatus) {
    return this.seasonsService.findAll(user.userId, { status });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSeasonDto) {
    return this.seasonsService.create(user.userId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.seasonsService.findOne(user.userId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSeasonDto) {
    return this.seasonsService.update(user.userId, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.seasonsService.close(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.seasonsService.remove(user.userId, id);
  }
}
