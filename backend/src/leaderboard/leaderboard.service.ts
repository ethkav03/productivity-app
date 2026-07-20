import { Injectable } from '@nestjs/common';
import { AttributeKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { LeaderboardMetric, LeaderboardPeriod, LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { periodStart } from './period-bounds';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  isCurrentUser: boolean;
  value: number;
  characterLevel: number;
}

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
  ) {}

  async getLeaderboard(userId: string, query: LeaderboardQueryDto): Promise<LeaderboardEntry[]> {
    const friendIds = await this.friendsService.getFriendUserIds(userId);
    const groupIds = [userId, ...friendIds];

    if (query.metric === LeaderboardMetric.ATTRIBUTE) {
      return this.rankByAttribute(groupIds, userId, query.attributeKey as AttributeKey);
    }
    if (query.metric === LeaderboardMetric.XP) {
      return this.rankByXp(groupIds, userId, query.period as LeaderboardPeriod);
    }
    return this.rankByLevel(groupIds, userId);
  }

  private async rankByLevel(groupIds: string[], viewerId: string): Promise<LeaderboardEntry[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, username: true, avatar: true, level: true, totalXP: true },
    });

    const sorted = users.sort(
      (a, b) => b.level - a.level || b.totalXP - a.totalXP || a.username.localeCompare(b.username),
    );

    return sorted.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      isCurrentUser: user.id === viewerId,
      value: user.level,
      characterLevel: user.level,
    }));
  }

  private async rankByAttribute(
    groupIds: string[],
    viewerId: string,
    attributeKey: AttributeKey,
  ): Promise<LeaderboardEntry[]> {
    const attributes = await this.prisma.attribute.findMany({
      where: { userId: { in: groupIds }, key: attributeKey },
      select: {
        userId: true,
        level: true,
        totalXP: true,
        user: { select: { username: true, avatar: true, level: true } },
      },
    });

    const sorted = attributes.sort(
      (a, b) => b.level - a.level || b.totalXP - a.totalXP || a.user.username.localeCompare(b.user.username),
    );

    return sorted.map((attribute, index) => ({
      rank: index + 1,
      userId: attribute.userId,
      username: attribute.user.username,
      avatar: attribute.user.avatar,
      isCurrentUser: attribute.userId === viewerId,
      value: attribute.level,
      characterLevel: attribute.user.level,
    }));
  }

  private async rankByXp(groupIds: string[], viewerId: string, period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, username: true, avatar: true, level: true, totalXP: true },
    });

    const start = periodStart(period);
    let xpByUser: Map<string, number>;
    if (!start) {
      xpByUser = new Map(users.map((user) => [user.id, user.totalXP]));
    } else {
      const aggregate = await this.prisma.xPTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: groupIds }, skillId: null, attributeId: null, createdAt: { gte: start } },
        _sum: { amount: true },
      });
      xpByUser = new Map(aggregate.map((row) => [row.userId, row._sum.amount ?? 0]));
    }

    const sorted = users
      .map((user) => ({ ...user, xp: xpByUser.get(user.id) ?? 0 }))
      .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));

    return sorted.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      isCurrentUser: user.id === viewerId,
      value: user.xp,
      characterLevel: user.level,
    }));
  }
}
