import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { SkillsService } from '../skills/skills.service';
import { AchievementsService } from '../achievements/achievements.service';
import { AttributesService } from '../attributes/attributes.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ProgressGoalDto } from './dto/progress-goal.dto';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../common/dto/activity-reward.dto';

const goalInclude = {
  goalSkills: { include: { skill: { include: { attribute: true } } } },
  attributeBonuses: { include: { attribute: { select: { id: true, key: true, name: true } } } },
} satisfies Prisma.GoalInclude;

type GoalWithSkills = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
    private readonly achievementsService: AchievementsService,
    private readonly attributesService: AttributesService,
  ) {}

  /** See QuestsService.validateRewardBundle - identical rules, duplicated per module rather than shared across a DI boundary. */
  private async validateRewardBundle(
    userId: string,
    skillIds: string[] | undefined,
    skillRewardOverrides: SkillRewardOverrideDto[] | undefined,
    attributeBonuses: AttributeBonusDto[] | undefined,
  ): Promise<void> {
    if (skillRewardOverrides?.length) {
      const taggedSkillIds = new Set(skillIds ?? []);
      const untagged = skillRewardOverrides.find((override) => !taggedSkillIds.has(override.skillId));
      if (untagged) {
        throw new BadRequestException(`Skill ${untagged.skillId} has a reward override but isn't tagged in skillIds`);
      }
    }
    if (attributeBonuses?.length) {
      await this.attributesService.assertOwnedAttributeIds(userId, attributeBonuses.map((bonus) => bonus.attributeId));
    }
  }

  private async serialize(goal: GoalWithSkills) {
    let linkedCompletedQuestCount = 0;
    if (goal.type === 'COMPLETION') {
      linkedCompletedQuestCount = await this.prisma.quest.count({
        where: { goalId: goal.id, status: 'COMPLETED' },
      });
    }

    let progressPercent: number;
    if (goal.type === 'BINARY') {
      progressPercent = goal.status === 'COMPLETED' ? 100 : 0;
    } else if (goal.targetValue == null || goal.targetValue <= 0) {
      progressPercent = 0;
    } else {
      const numerator = goal.type === 'COMPLETION' ? linkedCompletedQuestCount : goal.currentValue;
      progressPercent = Math.min(100, Math.max(0, (numerator / goal.targetValue) * 100));
    }

    const { goalSkills, attributeBonuses, ...rest } = goal;
    return {
      ...rest,
      skills: goalSkills.map((goalSkill) => goalSkill.skill),
      skillRewardOverrides: goalSkills.filter((gs) => gs.amount != null).map((gs) => ({ skillId: gs.skillId, amount: gs.amount as number })),
      attributeBonuses: attributeBonuses.map((bonus) => ({
        attributeId: bonus.attributeId,
        attributeName: bonus.attribute.name,
        amount: bonus.amount,
      })),
      progressPercent,
    };
  }

  async findAll(userId: string, filters: { status?: GoalStatus }) {
    const goals = await this.prisma.goal.findMany({
      where: { userId, ...(filters.status && { status: filters.status }) },
      include: goalInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(goals.map((goal) => this.serialize(goal)));
  }

  async findOne(userId: string, id: string) {
    const goal = await this.prisma.goal.findUnique({
      where: { id },
      include: goalInclude,
    });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();

    const quests = await this.prisma.quest.findMany({
      where: { goalId: id },
      orderBy: { createdAt: 'desc' },
    });

    return { ...(await this.serialize(goal)), quests };
  }

  async create(userId: string, dto: CreateGoalDto) {
    if (dto.skillIds?.length) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    await this.validateRewardBundle(userId, dto.skillIds, dto.skillRewardOverrides, dto.attributeBonuses);

    const type = dto.type ?? 'BINARY';
    if ((type === 'NUMERIC' || type === 'COMPLETION') && (dto.targetValue === undefined || dto.targetValue === null)) {
      throw new BadRequestException('targetValue is required for this goal type');
    }

    const xpReward = dto.xpReward ?? 500;
    const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));

    const goal = await this.prisma.goal.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        type,
        targetValue: dto.targetValue,
        unit: dto.unit,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        xpReward,
        goalSkills: {
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId, amount: overrideBySkillId.get(skillId) })),
        },
        attributeBonuses: {
          create: (dto.attributeBonuses ?? []).map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
        },
      },
      include: goalInclude,
    });

    // Creation-driven achievements (e.g. "Goal Setter") have no XP event to
    // hang off, so they're checked directly here rather than via
    // ProgressionService.
    await this.achievementsService.checkAndUnlock(userId);

    return this.serialize(goal);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    await this.getOwnedGoal(userId, id);

    if (dto.skillIds) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    if (dto.skillRewardOverrides || dto.attributeBonuses) {
      const currentSkillIds = dto.skillIds ?? (await this.prisma.goalSkill.findMany({ where: { goalId: id }, select: { skillId: true } })).map((gs) => gs.skillId);
      await this.validateRewardBundle(userId, currentSkillIds, dto.skillRewardOverrides, dto.attributeBonuses);
    }

    if (dto.skillIds) {
      const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));
      await this.prisma.$transaction([
        this.prisma.goalSkill.deleteMany({ where: { goalId: id } }),
        this.prisma.goalSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ goalId: id, skillId, amount: overrideBySkillId.get(skillId) })),
        }),
      ]);
    } else if (dto.skillRewardOverrides) {
      await this.prisma.$transaction(
        dto.skillRewardOverrides.map((override) =>
          this.prisma.goalSkill.updateMany({
            where: { goalId: id, skillId: override.skillId },
            data: { amount: override.amount },
          }),
        ),
      );
    }

    if (dto.attributeBonuses) {
      await this.prisma.$transaction([
        this.prisma.activityAttributeBonus.deleteMany({ where: { goalId: id } }),
        this.prisma.activityAttributeBonus.createMany({
          data: dto.attributeBonuses.map((bonus) => ({ goalId: id, attributeId: bonus.attributeId, amount: bonus.amount })),
        }),
      ]);
    }

    const goal = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.targetDate !== undefined && { targetDate: new Date(dto.targetDate) }),
        ...(dto.xpReward !== undefined && { xpReward: dto.xpReward }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: goalInclude,
    });

    return this.serialize(goal);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedGoal(userId, id);
    await this.prisma.goal.delete({ where: { id } });
    return { id, deleted: true };
  }

  async progress(userId: string, id: string, dto: ProgressGoalDto) {
    const goal = await this.prisma.goal.findUnique({
      where: { id },
      include: { goalSkills: true, attributeBonuses: true },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();
    if (goal.status !== 'ACTIVE') throw new BadRequestException('Goal is not active');

    let willComplete: boolean;
    let newCurrentValue: number;

    if (goal.type === 'BINARY') {
      willComplete = dto.value >= 1;
      newCurrentValue = willComplete ? 1 : goal.currentValue;
    } else {
      newCurrentValue = dto.value;
      willComplete = goal.targetValue != null && newCurrentValue >= goal.targetValue;
    }

    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        currentValue: newCurrentValue,
        ...(willComplete && { status: 'COMPLETED' as const, completedAt: new Date() }),
      },
      include: goalInclude,
    });

    if (willComplete) {
      const completion = await this.progressionService.completeActivity({
        userId,
        amount: goal.xpReward,
        sourceType: 'GOAL_COMPLETION',
        sourceId: goal.id,
        sourceName: goal.title,
        skillAwards: goal.goalSkills.map((goalSkill) => ({ skillId: goalSkill.skillId, amount: goalSkill.amount ?? undefined })),
        attributeBonuses: goal.attributeBonuses.map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
      });
      return { goal: await this.serialize(updated), completion };
    }

    return { goal: await this.serialize(updated) };
  }

  private async getOwnedGoal(userId: string, id: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();
    return goal;
  }
}
