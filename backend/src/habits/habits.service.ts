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
import { getDayKey, nextStreakValue } from '../common/period';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

const habitInclude = {
  habitSkills: { include: { skill: true } },
} satisfies Prisma.HabitInclude;

type HabitWithSkills = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;

function serializeHabit(habit: HabitWithSkills, completedToday: boolean) {
  const { habitSkills, ...rest } = habit;
  return {
    ...rest,
    skills: habitSkills.map((hs) => hs.skill),
    completedToday,
  };
}

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
  ) {}

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

    const frequency = dto.frequency ?? 'DAILY';
    const xpReward = dto.xpReward ?? 10;

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
        habitSkills: {
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId })),
        },
      },
      include: habitInclude,
    });

    return serializeHabit(habit, false);
  }

  async update(userId: string, id: string, dto: UpdateHabitDto) {
    await this.getOwnedHabit(userId, id);

    if (dto.skillIds) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
      await this.prisma.$transaction([
        this.prisma.habitSkill.deleteMany({ where: { habitId: id } }),
        this.prisma.habitSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ habitId: id, skillId })),
        }),
      ]);
    }

    const { skillIds, ...scalarFields } = dto;

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
      include: { habitSkills: true },
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

    const newStreak = nextStreakValue(previous?.periodKey ?? null, today, habit.currentStreak);
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
      skillIds: habit.habitSkills.map((hs) => hs.skillId),
    });
  }

  private async getOwnedHabit(userId: string, id: string) {
    const habit = await this.prisma.habit.findUnique({ where: { id } });
    if (!habit) throw new NotFoundException('Habit not found');
    if (habit.userId !== userId) throw new ForbiddenException();
    return habit;
  }
}
