import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { SkillsService } from '../skills/skills.service';
import { AttributesService } from '../attributes/attributes.service';
import { daysBetweenKeys, getDayKey, nextStreakValue } from '../common/period';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../common/dto/activity-reward.dto';

const habitInclude = {
  habitSkills: { include: { skill: { include: { attribute: true } } } },
  attributeBonuses: { include: { attribute: { select: { id: true, key: true, name: true } } } },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.HabitInclude;

type HabitWithSkills = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;

function serializeHabit(habit: HabitWithSkills, completedToday: boolean) {
  const { habitSkills, attributeBonuses, goal, ...rest } = habit;
  return {
    ...rest,
    skills: habitSkills.map((hs) => hs.skill),
    skillRewardOverrides: habitSkills.filter((hs) => hs.amount != null).map((hs) => ({ skillId: hs.skillId, amount: hs.amount as number })),
    attributeBonuses: attributeBonuses.map((bonus) => ({
      attributeId: bonus.attributeId,
      attributeName: bonus.attribute.name,
      amount: bonus.amount,
    })),
    goal: goal ?? null,
    completedToday,
  };
}

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
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

  async findAll(userId: string) {
    const habits = await this.prisma.habit.findMany({
      where: { userId },
      include: habitInclude,
      orderBy: { createdAt: 'asc' },
    });

    const today = getDayKey();
    const todaysCompletions = await this.prisma.habitCompletion.findMany({
      where: { userId, periodKey: today },
      select: { habitId: true },
    });
    const completedSet = new Set(todaysCompletions.map((c) => c.habitId));

    return habits.map((habit) => serializeHabit(habit, completedSet.has(habit.id)));
  }

  async create(userId: string, dto: CreateHabitDto) {
    if (dto.skillIds?.length) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    if (dto.goalId) {
      await this.assertOwnedGoal(userId, dto.goalId);
    }
    await this.validateRewardBundle(userId, dto.skillIds, dto.skillRewardOverrides, dto.attributeBonuses);

    const frequency = dto.frequency ?? 'DAILY';
    const xpReward = dto.xpReward ?? 10;
    const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));

    const habit = await this.prisma.habit.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        frequency,
        daysOfWeek: dto.daysOfWeek ?? [],
        timesPerWeek: dto.timesPerWeek,
        timeOfDay: dto.timeOfDay,
        xpReward,
        goalId: dto.goalId,
        habitSkills: {
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId, amount: overrideBySkillId.get(skillId) })),
        },
        attributeBonuses: {
          create: (dto.attributeBonuses ?? []).map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
        },
      },
      include: habitInclude,
    });

    return serializeHabit(habit, false);
  }

  async update(userId: string, id: string, dto: UpdateHabitDto) {
    await this.getOwnedHabit(userId, id);

    if (dto.goalId !== undefined && dto.goalId !== null) {
      await this.assertOwnedGoal(userId, dto.goalId);
    }

    if (dto.skillIds) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    if (dto.skillRewardOverrides || dto.attributeBonuses) {
      const currentSkillIds = dto.skillIds ?? (await this.prisma.habitSkill.findMany({ where: { habitId: id }, select: { skillId: true } })).map((hs) => hs.skillId);
      await this.validateRewardBundle(userId, currentSkillIds, dto.skillRewardOverrides, dto.attributeBonuses);
    }

    if (dto.skillIds) {
      const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));
      await this.prisma.$transaction([
        this.prisma.habitSkill.deleteMany({ where: { habitId: id } }),
        this.prisma.habitSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ habitId: id, skillId, amount: overrideBySkillId.get(skillId) })),
        }),
      ]);
    } else if (dto.skillRewardOverrides) {
      await this.prisma.$transaction(
        dto.skillRewardOverrides.map((override) =>
          this.prisma.habitSkill.updateMany({
            where: { habitId: id, skillId: override.skillId },
            data: { amount: override.amount },
          }),
        ),
      );
    }

    if (dto.attributeBonuses) {
      await this.prisma.$transaction([
        this.prisma.activityAttributeBonus.deleteMany({ where: { habitId: id } }),
        this.prisma.activityAttributeBonus.createMany({
          data: dto.attributeBonuses.map((bonus) => ({ habitId: id, attributeId: bonus.attributeId, amount: bonus.amount })),
        }),
      ]);
    }

    const { skillIds, skillRewardOverrides, attributeBonuses, ...scalarFields } = dto;

    const habit = await this.prisma.habit.update({
      where: { id },
      data: scalarFields,
      include: habitInclude,
    });

    const completion = await this.prisma.habitCompletion.findFirst({
      where: { habitId: id, periodKey: getDayKey() },
    });

    return serializeHabit(habit, !!completion);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedHabit(userId, id);
    await this.prisma.habit.delete({ where: { id } });
    return { id, deleted: true };
  }

  async complete(userId: string, id: string) {
    const habit = await this.prisma.habit.findUnique({
      where: { id },
      include: { habitSkills: true, attributeBonuses: true },
    });
    if (!habit) throw new NotFoundException('Habit not found');
    if (habit.userId !== userId) throw new ForbiddenException();
    if (!habit.isActive) throw new BadRequestException('Habit is not active');

    const today = getDayKey();

    const previous = await this.prisma.habitCompletion.findFirst({
      where: { habitId: id },
      orderBy: { completedAt: 'desc' },
    });

    try {
      await this.prisma.habitCompletion.create({
        data: { habitId: id, userId, periodKey: today },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Habit already completed for this period');
      }
      throw error;
    }

    const newStreak = await this.nextHabitStreak(userId, previous?.periodKey ?? null, today, habit.currentStreak);
    const longestStreak = Math.max(habit.longestStreak, newStreak);

    await this.prisma.habit.update({
      where: { id },
      data: { currentStreak: newStreak, longestStreak },
    });

    return this.progressionService.completeActivity({
      userId,
      amount: habit.xpReward,
      sourceType: 'HABIT_COMPLETION',
      sourceId: habit.id,
      sourceName: habit.title,
      skillAwards: habit.habitSkills.map((hs) => ({ skillId: hs.skillId, amount: hs.amount ?? undefined })),
      attributeBonuses: habit.attributeBonuses.map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
    });
  }

  /**
   * "Perks" (Sprint 3): a STREAK_PROTECTION LevelReward grants the user
   * one-time-use `habitStreakProtectionCharges`. If this completion would
   * otherwise reset the habit's streak (a >1-day gap since the last
   * completion), and the user has a charge available, consume one and
   * preserve continuity instead of resetting - matching the roadmap's
   * "protect one habit streak" framing (scoped to habits, not the
   * character streak; see docs/gameplay-systems.md).
   */
  private async nextHabitStreak(
    userId: string,
    previousPeriodKey: string | null,
    newPeriodKey: string,
    previousStreak: number,
  ): Promise<number> {
    const wouldBreak = previousPeriodKey !== null && daysBetweenKeys(previousPeriodKey, newPeriodKey) > 1;
    if (!wouldBreak) {
      return nextStreakValue(previousPeriodKey, newPeriodKey, previousStreak);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.habitStreakProtectionCharges <= 0) {
      return nextStreakValue(previousPeriodKey, newPeriodKey, previousStreak);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { habitStreakProtectionCharges: { decrement: 1 } },
    });
    return previousStreak + 1;
  }

  /** See QuestsService.assertOwnedGoal - identical check, duplicated per module rather than shared across a DI boundary. */
  private async assertOwnedGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
  }

  private async getOwnedHabit(userId: string, id: string) {
    const habit = await this.prisma.habit.findUnique({ where: { id } });
    if (!habit) throw new NotFoundException('Habit not found');
    if (habit.userId !== userId) throw new ForbiddenException();
    return habit;
  }
}
