import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JournalService } from './journal.service';
import { UpsertJournalEntryDto } from './dto/upsert-journal-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { getDayKey } from '../common/period';

@ApiTags('journal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  getDay(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.journalService.getDay(user.userId, date ?? getDayKey());
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query('days') daysParam?: string) {
    const days = daysParam ? Number(daysParam) : undefined;
    return this.journalService.history(user.userId, days);
  }

  @Get('capacity')
  getCapacity(@CurrentUser() user: AuthenticatedUser) {
    return this.journalService.getCapacity(user.userId);
  }

  @Get('correlations')
  getCorrelations(@CurrentUser() user: AuthenticatedUser) {
    return this.journalService.getCorrelations(user.userId);
  }

  @Put(':date')
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
    @Body() dto: UpsertJournalEntryDto,
  ) {
    return this.journalService.upsert(user.userId, date, dto);
  }
}
