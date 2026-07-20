import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestCategory, QuestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { CompletionResult } from '../progression/progression.types';
import { SkillsService } from '../skills/skills.service';
import { AttributesService } from '../attributes/attributes.service';
import { GoalsService } from '../goals/goals.service';
import { getDayKey } from '../common/period';
import { DIFFICULTY_XP } from '../common/leveling';
import { findNeglectedAttribute } from '../common/neglected-attribute';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../common/dto/activity-reward.dto';
import { QuestRequirementDto } from '../common/dto/quest-requirement.dto';
import { buildRequirementSnapshot, evaluateRequirements } from './quest-requirements';

const SYSTEM_QUEST_REFRESH_DAYS = 7;

const requirementInclude = {
  skill: { select: { name: true } },
  attribute: { select: { name: true } },
  achievement: { select: { name: true } },
  requiredQuest: { select: { title: true } },
  requiredGoal: { select: { title: true } },
} satisfies Prisma.QuestRequirementInclude;

const questInclude = {
  questSkills: { include: { skill: { include: { attribute: true } } } },
  attributeBonuses: { include: { attribute: { select: { id: true, key: true, name: true } } } },
  goal: { select: { id: true, title: true } },
  requirements: { include: requirementInclude },
  // Only the count matters for serialization - claim() re-fetches full rows itself.
  completions: { where: { claimedAt: null }, select: { id: true } },
} satisfies Prisma.QuestInclude;

type QuestWithRelations = Prisma.QuestGetPayload<{ include: typeof questInclude }>;
type RequirementSnapshot = Awaited<ReturnType<typeof buildRequirementSnapshot>>;

function serializeQuest(quest: QuestWithRelations, snapshot: RequirementSnapshot) {
  const { questSkills, attributeBonuses, goal, requirements, completions, ...rest } = quest;

  const completedToday =
    rest.type === 'RECURRING'
      ? !!rest.lastCompletedAt && getDayKey(rest.lastCompletedAt) === getDayKey()
      : rest.status === 'COMPLETED';

  const { requirements: evaluatedRequirements, isLocked } = evaluateRequirements(requirements, snapshot);

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
    // "Level-gated quests": a locked quest is never hidden - it's shown with
    // its requirements and how close each one is to being met.
    isLocked,
    requirements: evaluatedRequirements,
    // "Reward claiming": completions that happened but haven't had their XP
    // claimed yet - the frontend shows "Claim Reward" instead of "Complete"
    // when this is > 0.
    unclaimedCompletions: completions.length,
  };
}

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
    private readonly skillsService: SkillsService,
    private readonly attributesService: AttributesService,
    private readonly goalsService: GoalsService,
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

  /**
   * "Level-gated quests": validates each requirement's shape (which fields
   * are needed depends on `type`) and ownership of whatever it references.
   * `currentQuestId` (only set on update, since a quest can't reference
   * itself before it exists) guards against a requirement making a quest
   * require its own completion.
   */
  private async validateRequirements(
    userId: string,
    requirements: QuestRequirementDto[] | undefined,
    currentQuestId?: string,
  ): Promise<void> {
    if (!requirements?.length) return;

    for (const requirement of requirements) {
      switch (requirement.type) {
        case 'LEVEL_THRESHOLD': {
          if (requirement.skillId && requirement.attributeId) {
            throw new BadRequestException('A LEVEL_THRESHOLD requirement can target a skill or an attribute, not both');
          }
          if (requirement.level === undefined) {
            throw new BadRequestException('LEVEL_THRESHOLD requirements need a level');
          }
          if (requirement.skillId) {
            // eslint-disable-next-line no-await-in-loop
            await this.skillsService.assertOwnedSkillIds(userId, [requirement.skillId]);
          }
          if (requirement.attributeId) {
            // eslint-disable-next-line no-await-in-loop
            await this.attributesService.assertOwnedAttributeIds(userId, [requirement.attributeId]);
          }
          break;
        }
        case 'ACTIVITY_COUNT': {
          if (!requirement.skillId || requirement.count === undefined) {
            throw new BadRequestException('ACTIVITY_COUNT requirements need a skillId and a count');
          }
          // eslint-disable-next-line no-await-in-loop
          await this.skillsService.assertOwnedSkillIds(userId, [requirement.skillId]);
          break;
        }
        case 'ACHIEVEMENT': {
          if (!requirement.achievementId) {
            throw new BadRequestException('ACHIEVEMENT requirements need an achievementId');
          }
          // eslint-disable-next-line no-await-in-loop
          const achievement = await this.prisma.achievement.findUnique({ where: { id: requirement.achievementId } });
          if (!achievement) throw new NotFoundException('Achievement not found');
          break;
        }
        case 'QUEST_COMPLETED': {
          if (!requirement.requiredQuestId) {
            throw new BadRequestException('QUEST_COMPLETED requirements need a requiredQuestId');
          }
          if (currentQuestId && requirement.requiredQuestId === currentQuestId) {
            throw new BadRequestException('A quest cannot require itself');
          }
          // eslint-disable-next-line no-await-in-loop
          await this.getOwnedQuest(userId, requirement.requiredQuestId);
          break;
        }
        case 'GOAL_COMPLETED': {
          if (!requirement.requiredGoalId) {
            throw new BadRequestException('GOAL_COMPLETED requirements need a requiredGoalId');
          }
          // eslint-disable-next-line no-await-in-loop
          await this.assertOwnedGoal(userId, requirement.requiredGoalId);
          break;
        }
      }
    }
  }

  async findAll(userId: string, filters: { status?: QuestStatus; goalId?: string; category?: QuestCategory }) {
    await this.ensureSystemQuest(userId);

    const [quests, snapshot] = await Promise.all([
      this.prisma.quest.findMany({
        where: {
          userId,
          ...(filters.status && { status: filters.status }),
          ...(filters.goalId && { goalId: filters.goalId }),
          ...(filters.category && { category: filters.category }),
        },
        include: questInclude,
        orderBy: { createdAt: 'desc' },
      }),
      buildRequirementSnapshot(this.prisma, userId),
    ]);

    return quests.map((quest) => serializeQuest(quest, snapshot));
  }

  async findOne(userId: string, id: string) {
    const quest = await this.prisma.quest.findUnique({ where: { id }, include: questInclude });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();
    const snapshot = await buildRequirementSnapshot(this.prisma, userId);
    return serializeQuest(quest, snapshot);
  }

  async create(userId: string, dto: CreateQuestDto) {
    if (dto.goalId) {
      await this.assertOwnedGoal(userId, dto.goalId);
    }
    if (dto.skillIds?.length) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    await this.validateRewardBundle(userId, dto.skillIds, dto.skillRewardOverrides, dto.attributeBonuses);
    await this.validateRequirements(userId, dto.requirements);

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
        category: dto.category,
        xpReward,
        goalId: dto.goalId,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        questSkills: {
          create: (dto.skillIds ?? []).map((skillId) => ({ skillId, amount: overrideBySkillId.get(skillId) })),
        },
        attributeBonuses: {
          create: (dto.attributeBonuses ?? []).map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount })),
        },
        requirements: {
          create: (dto.requirements ?? []).map((requirement) => ({
            type: requirement.type,
            skillId: requirement.skillId,
            attributeId: requirement.attributeId,
            level: requirement.level,
            count: requirement.count,
            achievementId: requirement.achievementId,
            requiredQuestId: requirement.requiredQuestId,
            requiredGoalId: requirement.requiredGoalId,
          })),
        },
      },
      include: questInclude,
    });

    const snapshot = await buildRequirementSnapshot(this.prisma, userId);
    return serializeQuest(quest, snapshot);
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
    if (dto.requirements) {
      await this.validateRequirements(userId, dto.requirements, id);
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

    if (dto.requirements) {
      await this.prisma.$transaction([
        this.prisma.questRequirement.deleteMany({ where: { questId: id } }),
        this.prisma.questRequirement.createMany({
          data: dto.requirements.map((requirement) => ({
            questId: id,
            type: requirement.type,
            skillId: requirement.skillId,
            attributeId: requirement.attributeId,
            level: requirement.level,
            count: requirement.count,
            achievementId: requirement.achievementId,
            requiredQuestId: requirement.requiredQuestId,
            requiredGoalId: requirement.requiredGoalId,
          })),
        }),
      ]);
    }

    const { skillIds, skillRewardOverrides, attributeBonuses, requirements, deadline, ...scalarFields } = dto;

    await this.prisma.quest.update({
      where: { id },
      data: {
        ...scalarFields,
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      },
    });

    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedQuest(userId, id);
    await this.prisma.quest.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Marks a completion - creates a QuestCompletion row keyed by period
   * ("once" for non-recurring quests; a day-key for recurring ones, reusing
   * the same dedup mechanism HabitCompletion already uses) - but does NOT
   * award XP. See claimReward() for the actual reward grant ("reward
   * claiming" - completing and claiming are deliberately separate steps).
   */
  async complete(userId: string, id: string) {
    const quest = await this.prisma.quest.findUnique({ where: { id } });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();
    if (quest.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot complete an archived quest');
    }

    const requirementRows = await this.prisma.questRequirement.findMany({
      where: { questId: id },
      include: requirementInclude,
    });
    if (requirementRows.length > 0) {
      const snapshot = await buildRequirementSnapshot(this.prisma, userId);
      const { isLocked } = evaluateRequirements(requirementRows, snapshot);
      if (isLocked) {
        throw new BadRequestException('Quest is locked - requirements not yet met');
      }
    }

    const periodKey = quest.type === 'RECURRING' ? getDayKey() : 'once';

    let completion;
    try {
      const [completionRow] = await this.prisma.$transaction([
        this.prisma.questCompletion.create({ data: { questId: id, userId, periodKey } }),
        quest.type === 'RECURRING'
          ? this.prisma.quest.update({ where: { id }, data: { lastCompletedAt: new Date() } })
          : this.prisma.quest.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      ]);
      completion = completionRow;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(quest.type === 'RECURRING' ? 'Quest already completed today' : 'Quest already completed');
      }
      throw error;
    }

    // "goal↔quest relationships" (Sprint 4): a non-recurring quest reaching
    // COMPLETED status is the trigger for keeping a linked COMPLETION-type
    // goal's progress in sync - see GoalsService.syncCompletionProgress.
    // Recurring quests never reach status COMPLETED, so there's nothing to
    // sync for them.
    if (quest.type !== 'RECURRING' && quest.goalId) {
      await this.goalsService.syncCompletionProgress(userId, quest.goalId);
    }

    const updatedQuest = await this.findOne(userId, id);
    return { quest: updatedQuest, completion };
  }

  /**
   * Claims every not-yet-claimed completion for this quest (there can be
   * more than one for a recurring quest the user hasn't opened the app to
   * claim in a few days), awarding XP once per completion so the ledger
   * keeps one event per actual completion rather than summing them.
   * Deliberately re-reads the quest's *current* reward config rather than a
   * snapshot from completion time - see QuestCompletion's doc comment.
   */
  async claimReward(userId: string, id: string): Promise<CompletionResult[]> {
    const quest = await this.prisma.quest.findUnique({
      where: { id },
      include: { questSkills: true, attributeBonuses: true },
    });
    if (!quest) throw new NotFoundException('Quest not found');
    if (quest.userId !== userId) throw new ForbiddenException();

    const pending = await this.prisma.questCompletion.findMany({
      where: { questId: id, userId, claimedAt: null },
      orderBy: { completedAt: 'asc' },
    });
    if (pending.length === 0) {
      throw new ConflictException('No pending reward to claim for this quest');
    }

    const skillAwards = quest.questSkills.map((qs) => ({ skillId: qs.skillId, amount: qs.amount ?? undefined }));
    const attributeBonuses = quest.attributeBonuses.map((bonus) => ({ attributeId: bonus.attributeId, amount: bonus.amount }));

    const results: CompletionResult[] = [];
    for (const completionRow of pending) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.progressionService.completeActivity({
        userId,
        amount: quest.xpReward,
        sourceType: 'QUEST_COMPLETION',
        sourceId: quest.id,
        sourceName: quest.title,
        skillAwards,
        attributeBonuses,
      });
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.questCompletion.update({ where: { id: completionRow.id }, data: { claimedAt: new Date() } });
      results.push(result);
    }

    return results;
  }

  /**
   * "Quest Board" System quests: generated lazily rather than via a
   * scheduled job. If the user has no SYSTEM-category quest created in the
   * last SYSTEM_QUEST_REFRESH_DAYS, creates one nudging their most-neglected
   * attribute (shared heuristic with Daily/Weekly Challenges - see
   * findNeglectedAttribute). A no-op if the user has no skills anywhere yet
   * (nothing sensible to tag), so brand-new accounts don't get a quest
   * before they've created their first skill.
   */
  private async ensureSystemQuest(userId: string): Promise<void> {
    const refreshCutoff = new Date(Date.now() - SYSTEM_QUEST_REFRESH_DAYS * 24 * 60 * 60 * 1000);
    const recentSystemQuest = await this.prisma.quest.findFirst({
      where: { userId, category: 'SYSTEM', createdAt: { gte: refreshCutoff } },
      select: { id: true },
    });
    if (recentSystemQuest) return;

    const neglected = await findNeglectedAttribute(this.prisma, userId, { requireSkill: true });
    if (!neglected || !neglected.skill) return;

    await this.prisma.quest.create({
      data: {
        userId,
        title: 'Balance Your Build',
        description: `${neglected.attributeName} has received the least attention lately - complete one activity to bring it back into balance.`,
        type: 'ONE_TIME',
        difficulty: 'MEDIUM',
        category: 'SYSTEM',
        xpReward: DIFFICULTY_XP.MEDIUM,
        questSkills: { create: [{ skillId: neglected.skill.id }] },
      },
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
