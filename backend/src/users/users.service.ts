import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { toPublicUser } from '../common/serializers/public-user';

const meInclude = { equippedTitle: { select: { id: true, name: true } } };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: meInclude });
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username is already taken');
      }
    }

    if (dto.equippedTitleId) {
      await this.assertOwnedUnlockedTitle(userId, dto.equippedTitleId);
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data: dto, include: meInclude });
    return toPublicUser(user);
  }

  /** A title can only be equipped if it's a TITLE-type LevelReward the caller has actually unlocked. */
  private async assertOwnedUnlockedTitle(userId: string, levelRewardId: string): Promise<void> {
    const unlocked = await this.prisma.userLevelReward.findFirst({
      where: { userId, levelRewardId, levelReward: { type: 'TITLE' } },
    });
    if (!unlocked) {
      throw new BadRequestException('That title has not been unlocked');
    }
  }
}
