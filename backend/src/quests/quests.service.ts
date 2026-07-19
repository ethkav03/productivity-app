import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { SkillsService } from '../skills/skills.service';
import { getDayKey } from '../common/period';
import { DIFFICULTY_XP } from '../common/leveling';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';

const questInclude = {
  questSkills: { include: { skill: true } },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.QuestInclude;

type QuestWithRelations = Prisma.QuestGetPayload<{ include: typeof questInclude }>;

function serializeQuest(quest: QuestWithRelations) {
  const { questSkills, goal, ...rest } = quest;

  const completedToday =
    rest.type === 'RECURRING'
      ? !!rest.lastCompletedAt && getDayKey(rest.lastCompletedAt) === getDayKey()
      : rest.status === 'COMPLETED';

  return {
    ...rest,
    skills: questSkills.map((qs) => qs.skill),
    goal: goal ?? null,
    completedToday,
  };
}

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
  ) {}

  async findAll(userId: string, filters: { status?: QuestStatus; goalId?: string }) {
    const quests = await this.prisma.quest.findMany({
      where: {
        userId,
        ...(filters.status && { status: filters.status }),
        ...(filters.goalId && { goalId: filters.goalId }),
      },
      include: questInclude,
      orderBy: { createdAt: 'desc' },
    });

    return quests.map(serializeQuest);
  }

  async findOne(userId: string, id: string) {
    const quest = await this.prisma.quest.findUnique({ where: { id }, include: questInclude });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();
    return serializeQuest(quest);
  }

  async create(userId: string, dto: CreateQuestDto) {
    if (dto.goalId) {
      await this.assertOwnedGoal(userId, dto.goalId);
    }
    if (dto.skillIds?.length) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }

    const difficulty = dto.difficulty ?? 'MEDIUM';
    const type = dto.type ?? 'ONE_TIME';
    const xpReward = dto.xpReward ?? DIFFICULTY_XP[difficulty];

    const quest = await this.prisma.quest.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        type,
        difficulty,
        xpReward,
        goalId: dto.goalId,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        questSkills: {
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId })),
        },
      },
      include: questInclude,
    });

    return serializeQuest(quest);
  }

  async update(userId: string, id: string, dto: UpdateQuestDto) {
    await this.getOwnedQuest(userId, id);

    if (dto.goalId !== undefined && dto.goalId !== null) {
      await this.assertOwnedGoal(userId, dto.goalId);
    }

    if (dto.skillIds) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
      await this.prisma.$transaction([
        this.prisma.questSkill.deleteMany({ where: { questId: id } }),
        this.prisma.questSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ questId: id, skillId })),
        }),
      ]);
    }

    const { skillIds, deadline, ...scalarFields } = dto;

    const quest = await this.prisma.quest.update({
      where: { id },
      data: {
        ...scalarFields,
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      },
      include: questInclude,
    });

    return serializeQuest(quest);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedQuest(userId, id);
    await this.prisma.quest.delete({ where: { id } });
    return { id, deleted: true };
  }

  async complete(userId: string, id: string) {
    const quest = await this.prisma.quest.findUnique({
      where: { id },
      include: { questSkills: true },
    });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();
    if (quest.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot complete an archived quest');
    }

    const today = getDayKey();

    if (quest.type === 'RECURRING') {
      if (quest.lastCompletedAt && getDayKey(quest.lastCompletedAt) === today) {
        throw new ConflictException('Quest already completed today');
      }
      await this.prisma.quest.update({
        where: { id },
        data: { lastCompletedAt: new Date() },
      });
    } else {
      if (quest.status === 'COMPLETED') {
        throw new ConflictException('Quest already completed');
      }
      await this.prisma.quest.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    return this.progressionService.completeActivity({
      userId,
      amount: quest.xpReward,
      sourceType: 'QUEST_COMPLETION',
      sourceId: quest.id,
      skillIds: quest.questSkills.map((qs) => qs.skillId),
    });
  }

  private async assertOwnedGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
  }

  private async getOwnedQuest(userId: string, id: string) {
    const quest = await this.prisma.quest.findUnique({ where: { id } });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();
    return quest;
  }
}
