import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toPublicUser } from '../common/serializers/public-user';
import { ATTRIBUTE_KEY_ORDER } from '../attributes/default-attributes';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminAdjustXpDto } from './dto/admin-adjust-xp.dto';
import { AdminCreateFriendshipDto } from './dto/admin-create-friendship.dto';

const FRIENDSHIP_PARTY_SELECT = { id: true, username: true, avatar: true, level: true } as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    private readonly achievementsService: AchievementsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listUsers(search?: string) {
    const users = await this.prisma.user.findMany({
      where: search
        ? { OR: [{ username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => toPublicUser(user));
  }

  async getUserDetail(id: string) {
    const user = await this.getUserOrThrow(id);

    const [attributes, friendCount, skillCount, unlockedAchievements] = await Promise.all([
      this.prisma.attribute.findMany({ where: { userId: id } }),
      this.prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: id }, { addresseeId: id }] } }),
      this.prisma.skill.count({ where: { userId: id } }),
      this.prisma.userAchievement.findMany({
        where: { userId: id },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      }),
    ]);

    attributes.sort((a, b) => ATTRIBUTE_KEY_ORDER.indexOf(a.key) - ATTRIBUTE_KEY_ORDER.indexOf(b.key));

    return {
      ...toPublicUser(user),
      skillCount,
      friendCount,
      attributes: attributes.map((attribute) => ({
        id: attribute.id,
        key: attribute.key,
        name: attribute.name,
        level: attribute.level,
        totalXP: attribute.totalXP,
      })),
      unlockedAchievements: unlockedAchievements.map((row) => ({
        id: row.id,
        achievementId: row.achievementId,
        unlockedAt: row.unlockedAt,
        achievement: row.achievement,
      })),
    };
  }

  async updateUser(id: string, callerId: string, dto: AdminUpdateUserDto) {
    await this.getUserOrThrow(id);

    if (id === callerId && dto.isAdmin === false) {
      throw new BadRequestException('You cannot revoke your own admin access');
    }
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (existing && existing.id !== id) throw new ConflictException('Username is already taken');
    }
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) throw new ConflictException('Email is already taken');
    }

    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return toPublicUser(user);
  }

  async deleteUser(id: string, callerId: string) {
    await this.getUserOrThrow(id);
    if (id === callerId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.prisma.user.delete({ where: { id } });
    return { id, deleted: true };
  }

  async adjustXp(id: string, dto: AdminAdjustXpDto) {
    await this.getUserOrThrow(id);

    let attributeId: string | undefined;
    if (dto.attributeKey) {
      const attribute = await this.prisma.attribute.findFirst({ where: { userId: id, key: dto.attributeKey } });
      if (!attribute) throw new NotFoundException('Attribute not found for this user');
      attributeId = attribute.id;
    }

    const result = await this.xpService.applyCorrection({ userId: id, amount: dto.amount, note: dto.note, attributeId });

    if (result.scope === 'CHARACTER' && result.leveledUp) {
      await this.notificationsService.create(id, 'LEVEL_UP', 'Level up!', `You reached Level ${result.newLevel}.`);
    }
    await this.achievementsService.checkAndUnlock(id);

    return result;
  }

  listAchievements() {
    return this.achievementsService.findAll();
  }

  async grantAchievement(userId: string, achievementId: string) {
    await this.getUserOrThrow(userId);
    const achievement = await this.prisma.achievement.findUnique({ where: { id: achievementId } });
    if (!achievement) throw new NotFoundException('Achievement not found');

    const existing = await this.prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (existing) throw new ConflictException('User has already unlocked this achievement');

    const created = await this.prisma.userAchievement.create({
      data: { userId, achievementId },
      include: { achievement: true },
    });
    await this.notificationsService.create(
      userId,
      'ACHIEVEMENT_UNLOCK',
      `Achievement unlocked: ${achievement.name}`,
      achievement.description,
    );
    return created;
  }

  async revokeAchievement(userId: string, achievementId: string) {
    const existing = await this.prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (!existing) throw new NotFoundException('User has not unlocked this achievement');
    await this.prisma.userAchievement.delete({ where: { id: existing.id } });
    return { userId, achievementId, revoked: true };
  }

  async listFriendships() {
    const rows = await this.prisma.friendship.findMany({
      include: { requester: { select: FRIENDSHIP_PARTY_SELECT }, addressee: { select: FRIENDSHIP_PARTY_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  async createFriendship(dto: AdminCreateFriendshipDto) {
    const [requester, addressee] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.requesterUsername } }),
      this.prisma.user.findUnique({ where: { username: dto.addresseeUsername } }),
    ]);
    if (!requester) throw new NotFoundException(`No user found with username "${dto.requesterUsername}"`);
    if (!addressee) throw new NotFoundException(`No user found with username "${dto.addresseeUsername}"`);
    if (requester.id === addressee.id) throw new BadRequestException('A user cannot be friends with themselves');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: requester.id, addresseeId: addressee.id },
          { requesterId: addressee.id, addresseeId: requester.id },
        ],
      },
    });
    if (existing) throw new ConflictException('A friendship already exists between these users');

    const status = dto.status ?? 'ACCEPTED';
    return this.prisma.friendship.create({
      data: {
        requesterId: requester.id,
        addresseeId: addressee.id,
        status,
        respondedAt: status === 'ACCEPTED' ? new Date() : null,
      },
      include: { requester: { select: FRIENDSHIP_PARTY_SELECT }, addressee: { select: FRIENDSHIP_PARTY_SELECT } },
    });
  }

  async acceptFriendship(id: string) {
    const friendship = await this.getFriendshipOrThrow(id);
    if (friendship.status === 'ACCEPTED') throw new BadRequestException('This friendship is already accepted');
    return this.prisma.friendship.update({
      where: { id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
      include: { requester: { select: FRIENDSHIP_PARTY_SELECT }, addressee: { select: FRIENDSHIP_PARTY_SELECT } },
    });
  }

  async deleteFriendship(id: string) {
    await this.getFriendshipOrThrow(id);
    await this.prisma.friendship.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async getUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async getFriendshipOrThrow(id: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    return friendship;
  }
}
