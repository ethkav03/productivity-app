import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { DEFAULT_SKILLS } from './default-skills';
import { DEFAULT_ATTRIBUTES } from '../attributes/default-attributes';

const skillInclude = {
  attribute: { select: { id: true, key: true, name: true, icon: true } },
} satisfies Prisma.SkillInclude;

type SkillWithAttribute = Prisma.SkillGetPayload<{ include: typeof skillInclude }>;

function serializeSkill(skill: SkillWithAttribute) {
  const { currentLevelXp, xpForNextLevel } = calculateLevelState(skill.totalXP);
  return { ...skill, currentXP: currentLevelXp, xpForNextLevel };
}

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Suggested skills grouped by attribute, for onboarding and the "Add Skill" picker. */
  getSuggestions() {
    return DEFAULT_ATTRIBUTES.map((attribute) => ({
      ...attribute,
      skills: DEFAULT_SKILLS.filter((skill) => skill.attributeKey === attribute.key),
    }));
  }

  async findAll(userId: string) {
    const skills = await this.prisma.skill.findMany({
      where: { userId },
      include: skillInclude,
      orderBy: { name: 'asc' },
    });
    return skills.map(serializeSkill);
  }

  async findOne(userId: string, id: string) {
    const skill = await this.getOwnedSkill(userId, id);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weeklyXpAgg, recentActivity] = await Promise.all([
      this.prisma.xPTransaction.aggregate({
        where: { skillId: id, createdAt: { gte: weekAgo } },
        _sum: { amount: true },
      }),
      this.prisma.xPTransaction.findMany({
        where: { skillId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      ...serializeSkill(skill),
      weeklyXP: weeklyXpAgg._sum.amount ?? 0,
      recentActivity,
    };
  }

  async create(userId: string, dto: CreateSkillDto) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id: dto.attributeId } });
    if (!attribute || attribute.userId !== userId) {
      throw new NotFoundException('Attribute not found');
    }

    const existing = await this.prisma.skill.findFirst({
      where: { userId, attributeId: dto.attributeId, name: dto.name },
    });
    if (existing) throw new ConflictException('A skill with this name already exists under this attribute');

    const skill = await this.prisma.skill.create({
      data: {
        userId,
        attributeId: dto.attributeId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
      },
      include: skillInclude,
    });
    return serializeSkill(skill);
  }

  async update(userId: string, id: string, dto: UpdateSkillDto) {
    await this.getOwnedSkill(userId, id);

    if (dto.attributeId) {
      const attribute = await this.prisma.attribute.findUnique({ where: { id: dto.attributeId } });
      if (!attribute || attribute.userId !== userId) {
        throw new NotFoundException('Attribute not found');
      }
    }

    const skill = await this.prisma.skill.update({ where: { id }, data: dto, include: skillInclude });
    return serializeSkill(skill);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedSkill(userId, id);
    await this.prisma.skill.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Used internally by other modules (quests/habits/goals) to validate skill associations. */
  async assertOwnedSkillIds(userId: string, skillIds: string[]): Promise<void> {
    if (skillIds.length === 0) return;
    const count = await this.prisma.skill.count({ where: { id: { in: skillIds }, userId } });
    if (count !== new Set(skillIds).size) {
      throw new NotFoundException('One or more associated skills were not found');
    }
  }

  private async getOwnedSkill(userId: string, id: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id }, include: skillInclude });
    if (!skill) throw new NotFoundException('Skill not found');
    if (skill.userId !== userId) throw new ForbiddenException();
    return skill;
  }
}
