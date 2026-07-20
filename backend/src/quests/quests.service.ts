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
import { AttributesService } from '../attributes/attributes.service';
import { getDayKey } from '../common/period';
import { DIFFICULTY_XP } from '../common/leveling';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../common/dto/activity-reward.dto';

const questInclude = {
  questSkills: { include: { skill: { include: { attribute: true } } } },
  attributeBonuses: { include: { attribute: { select: { id: true, key: true, name: true } } } },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.QuestInclude;

type QuestWithRelations = Prisma.QuestGetPayload<{ include: typeof questInclude }>;

function serializeQuest(quest: QuestWithRelations) {
  const { questSkills, attributeBonuses, goal, ...rest } = quest;

  const completedToday =
    rest.type === 'RECURRING'
      ? !!rest.lastCompletedAt && getDayKey(rest.lastCompletedAt) === getDayKey()
      : rest.status === 'COMPLETED';

  return {
    ...rest,
    skills: questSkills.map((qs) => qs.skill),
    // "XP Bundles": only skills whose amount was explicitly overridden appear here -
    // any tagged skill not listed just gets the flat xpReward, as before.
    skillRewardOverrides: questSkills.filter((qs) => qs.amount != null).map((qs) => ({ skillId: qs.skillId, amount: qs.amount as number })),
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
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
    private readonly attributesService: AttributesService,
  ) {}

  /**
   * "XP Bundles": every skillRewardOverrides entry must target a skill
   * that's also tagged in skillIds (overriding a skill's amount only makes
   * sense if the skill is actually associated with the activity), and every
   * attributeBonuses entry must target an attribute the caller owns.
   */
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
    await this.validateRewardBundle(userId, dto.skillIds, dto.skillRewardOverrides, dto.attributeBonuses);

    const difficulty = dto.difficulty ?? 'MEDIUM';
    const type = dto.type ?? 'ONE_TIME';
    const xpReward = dto.xpReward ?? DIFFICULTY_XP[difficulty];
    const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));

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
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId, amount: overrideBySkillId.get(skillId) })),
        },
        attributeBonuses: {
          create: (dto.attributeBonuses ?? []).map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
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

    const effectiveSkillIds = dto.skillIds;
    if (dto.skillIds) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    if (dto.skillRewardOverrides || dto.attributeBonuses) {
      // Validate overrides against whichever skillIds are in effect after this update -
      // the ones being set now, or (if skillIds isn't part of this update) the quest's current tags.
      const currentSkillIds = effectiveSkillIds ?? (await this.prisma.questSkill.findMany({ where: { questId: id }, select: { skillId: true } })).map((qs) => qs.skillId);
      await this.validateRewardBundle(userId, currentSkillIds, dto.skillRewardOverrides, dto.attributeBonuses);
    }

    if (dto.skillIds) {
      const overrideBySkillId = new Map((dto.skillRewardOverrides ?? []).map((o) => [o.skillId, o.amount]));
      await this.prisma.$transaction([
        this.prisma.questSkill.deleteMany({ where: { questId: id } }),
        this.prisma.questSkill.createMany({
          data: dto.skillIds.map((skillId) => ({ questId: id, skillId, amount: overrideBySkillId.get(skillId) })),
        }),
      ]);
    } else if (dto.skillRewardOverrides) {
      // skillIds unchanged, but overrides for already-tagged skills are being updated individually.
      await this.prisma.$transaction(
        dto.skillRewardOverrides.map((override) =>
          this.prisma.questSkill.updateMany({
            where: { questId: id, skillId: override.skillId },
            data: { amount: override.amount },
          }),
        ),
      );
    }

    if (dto.attributeBonuses) {
      await this.prisma.$transaction([
        this.prisma.activityAttributeBonus.deleteMany({ where: { questId: id } }),
        this.prisma.activityAttributeBonus.createMany({
          data: dto.attributeBonuses.map((bonus) => ({ questId: id, attributeId: bonus.attributeId, amount: bonus.amount })),
        }),
      ]);
    }

    const { skillIds, skillRewardOverrides, attributeBonuses, deadline, ...scalarFields } = dto;

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
      include: { questSkills: true, attributeBonuses: true },
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
      sourceName: quest.title,
      skillAwards: quest.questSkills.map((qs) => ({ skillId: qs.skillId, amount: qs.amount ?? undefined })),
      attributeBonuses: quest.attributeBonuses.map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
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
