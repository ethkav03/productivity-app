import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { ATTRIBUTE_KEY_ORDER, DEFAULT_ATTRIBUTES } from './default-attributes';

function serializeWithLevel<T extends { totalXP: number }>(entity: T) {
  const { currentLevelXp, xpForNextLevel } = calculateLevelState(entity.totalXP);
  return { ...entity, currentXP: currentLevelXp, xpForNextLevel };
}

interface AttributeLike {
  id: string;
  key: string;
  name: string;
  icon: string | null;
}

/** Skills returned everywhere else carry a nested `attribute` summary - synthesize it here too rather than re-joining. */
function withAttributeSummary<T extends { totalXP: number }>(skill: T, attribute: AttributeLike) {
  return {
    ...serializeWithLevel(skill),
    attribute: { id: attribute.id, key: attribute.key, name: attribute.name, icon: attribute.icon },
  };
}

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every user gets all 8 fixed attributes at registration - they are not opt-in like skills. */
  async ensureDefaultAttributes(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    await tx.attribute.createMany({
      data: DEFAULT_ATTRIBUTES.map((attribute) => ({
        userId,
        key: attribute.key,
        name: attribute.name,
        description: attribute.description,
        icon: attribute.icon,
      })),
      skipDuplicates: true,
    });
  }

  async findAll(userId: string) {
    const attributes = await this.prisma.attribute.findMany({
      where: { userId },
      include: { skills: { orderBy: { name: 'asc' } } },
    });

    const sorted = attributes.sort(
      (a, b) => ATTRIBUTE_KEY_ORDER.indexOf(a.key) - ATTRIBUTE_KEY_ORDER.indexOf(b.key),
    );

    return sorted.map((attribute) => {
      const { skills, ...rest } = attribute;
      return {
        ...serializeWithLevel(rest),
        skills: skills.map((skill) => withAttributeSummary(skill, rest)),
      };
    });
  }

  async findOne(userId: string, id: string) {
    const attribute = await this.getOwnedAttribute(userId, id);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weeklyXpAgg, recentActivity, skills] = await Promise.all([
      this.prisma.xPTransaction.aggregate({
        where: { attributeId: id, createdAt: { gte: weekAgo } },
        _sum: { amount: true },
      }),
      this.prisma.xPTransaction.findMany({
        where: { attributeId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.skill.findMany({ where: { attributeId: id }, orderBy: { name: 'asc' } }),
    ]);

    return {
      ...serializeWithLevel(attribute),
      weeklyXP: weeklyXpAgg._sum.amount ?? 0,
      recentActivity,
      skills: skills.map((skill) => withAttributeSummary(skill, attribute)),
    };
  }

  /** Used internally by other modules (quests/habits/goals) to validate XP Bundle attribute-bonus targets. */
  async assertOwnedAttributeIds(userId: string, attributeIds: string[]): Promise<void> {
    if (attributeIds.length === 0) return;
    const count = await this.prisma.attribute.count({ where: { id: { in: attributeIds }, userId } });
    if (count !== new Set(attributeIds).size) {
      throw new NotFoundException('One or more bonus attributes were not found');
    }
  }

  private async getOwnedAttribute(userId: string, id: string) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attribute) throw new NotFoundException('Attribute not found');
    if (attribute.userId !== userId) throw new ForbiddenException();
    return attribute;
  }
}
