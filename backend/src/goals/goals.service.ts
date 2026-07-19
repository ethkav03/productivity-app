import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { SkillsService } from '../skills/skills.service';
import { AchievementsService } from '../achievements/achievements.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ProgressGoalDto } from './dto/progress-goal.dto';

const goalInclude = { goalSkills: { include: { skill: true } } } satisfies Prisma.GoalInclude;

type GoalWithSkills = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
    private readonly achievementsService: AchievementsService,
  ) {}

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

    const { goalSkills, ...rest } = goal;
    return {
      ...rest,
      skills: goalSkills.map((goalSkill) => goalSkill.skill),
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

    const type = dto.type ?? 'BINARY';
    if ((type === 'NUMERIC' || type === 'COMPLETION') && (dto.targetValue === undefined || dto.targetValue === null)) {
      throw new BadRequestException('targetValue is required for this goal type');
    }

    const xpReward = dto.xpReward ?? 500;

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
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId })),
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
      await this.prisma.$transaction([
        this.prisma.goalSkill.deleteMany({ where: { goalId: id } }),
        this.prisma.goalSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ goalId: id, skillId })),
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
      include: { goalSkills: true },
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
        skillIds: goal.goalSkills.map((goalSkill) => goalSkill.skillId),
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
