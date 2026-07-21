import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AttributesModule } from './attributes/attributes.module';
import { SkillsModule } from './skills/skills.module';
import { XpModule } from './xp/xp.module';
import { ProgressionModule } from './progression/progression.module';
import { AchievementsModule } from './achievements/achievements.module';
import { LevelRewardsModule } from './level-rewards/level-rewards.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QuestsModule } from './quests/quests.module';
import { HabitsModule } from './habits/habits.module';
import { GoalsModule } from './goals/goals.module';
import { SeasonsModule } from './seasons/seasons.module';
import { JournalModule } from './journal/journal.module';
import { ChallengesModule } from './challenges/challenges.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { FriendsModule } from './friends/friends.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AttributesModule,
    SkillsModule,
    XpModule,
    ProgressionModule,
    AchievementsModule,
    LevelRewardsModule,
    NotificationsModule,
    QuestsModule,
    HabitsModule,
    GoalsModule,
    SeasonsModule,
    JournalModule,
    ChallengesModule,
    AnalyticsModule,
    RecommendationsModule,
    FriendsModule,
    LeaderboardModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
