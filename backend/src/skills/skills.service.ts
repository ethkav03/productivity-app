import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { DEFAULT_SKILLS } from './default-skills';

function serializeSkill(skill: { totalXP: number; level: number; [key: string]: unknown }) {
  const { currentLevelXp, xpForNextLevel } = calculateLevelState(skill.totalXP);
  return { ...skill, currentXP: currentLevelXp, xpForNextLevel };
}

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  getSuggestions() {
    return DEFAULT_SKILLS;
  }

  async findAll(userId: string) {
    const skills = await this.prisma.skill.findMany({ where: { userId }, orderBy: { name: 'asc' } });
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
    const existing = await this.prisma.skill.findFirst({ where: { userId, name: dto.name } });
    if (existing) throw new ConflictException('A skill with this name already exists');

    const skill = await this.prisma.skill.create({
      data: { userId, name: dto.name, description: dto.description, icon: dto.icon },
    });
    return serializeSkill(skill);
  }

  async update(userId: string, id: string, dto: UpdateSkillDto) {
    await this.getOwnedSkill(userId, id);
    const skill = await this.prisma.skill.update({ where: { id }, data: dto });
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
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');
    if (skill.userId !== userId) throw new ForbiddenException();
    return skill;
  }
}
