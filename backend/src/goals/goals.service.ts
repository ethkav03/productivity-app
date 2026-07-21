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
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../common/dto/activity-reward.dto';
import { CompletionResult } from '../progression/progression.types';

const goalInclude = {
  goalSkills: { include: { skill: { include: { attribute: true } } } },
  attributeBonuses: { include: { attribute: { select: { id: true, key: true, name: true } } } },
  milestones: { orderBy: { order: 'asc' } },
  season: { select: { id: true, title: true } },
} satisfies Prisma.GoalInclude;

type GoalWithSkills = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;
type GoalWithRewardRelations = Prisma.GoalGetPayload<{ include: { goalSkills: true; attributeBonuses: true } }>;

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

    const { goalSkills, attributeBonuses, milestones, season, ...rest } = goal;
    return {
      ...rest,
      skills: goalSkills.map((goalSkill) => goalSkill.skill),
      skillRewardOverrides: goalSkills.filter((gs) => gs.amount != null).map((gs) => ({ skillId: gs.skillId, amount: gs.amount as number })),
      attributeBonuses: attributeBonuses.map((bonus) => ({
        attributeId: bonus.attributeId,
        attributeName: bonus.attribute.name,
        amount: bonus.amount,
      })),
      milestones,
      season: season ?? null,
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

    const [quests, habits] = await Promise.all([
      this.prisma.quest.findMany({ where: { goalId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.habit.findMany({ where: { goalId: id }, orderBy: { createdAt: 'desc' } }),
    ]);

    return { ...(await this.serialize(goal)), quests, habits };
  }

  async create(userId: string, dto: CreateGoalDto) {
    if (dto.skillIds?.length) {
      await this.skillsService.assertOwnedSkillIds(userId, dto.skillIds);
    }
    if (dto.seasonId) {
      await this.assertOwnedSeason(userId, dto.seasonId);
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
        seasonId: dto.seasonId,
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

    if (dto.seasonId !== undefined && dto.seasonId !== null) {
      await this.assertOwnedSeason(userId, dto.seasonId);
    }

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
        ...(dto.seasonId !== undefined && { seasonId: dto.seasonId }),
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

    return this.finalizeGoalProgress(userId, goal, newCurrentValue, willComplete);
  }

  /**
   * "goal↔quest relationships" (Sprint 4): called by QuestsService right
   * after a non-recurring quest tagged to this goal is marked COMPLETED, so a
   * COMPLETION-type goal's currentValue - and completion - track its linked
   * quests automatically, instead of requiring the user to manually re-count
   * and type a number into POST /goals/:id/progress. Deliberately does NOT
   * count linked Habits toward this - a habit has no discrete "done" state
   * the way a quest does, so it doesn't fit the same counting model (habit
   * links are organizational only, shown on the goal detail page).
   * No-ops (returns null) for any goal that isn't an ACTIVE COMPLETION-type
   * goal - this is a best-effort sync, not something the caller depends on.
   */
  async syncCompletionProgress(userId: string, goalId: string): Promise<CompletionResult | null> {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: { goalSkills: true, attributeBonuses: true },
    });
    if (!goal || goal.userId !== userId || goal.status !== 'ACTIVE' || goal.type !== 'COMPLETION') {
      return null;
    }

    const linkedCompletedQuestCount = await this.prisma.quest.count({
      where: { goalId, status: 'COMPLETED' },
    });
    const willComplete = goal.targetValue != null && linkedCompletedQuestCount >= goal.targetValue;

    const result = await this.finalizeGoalProgress(userId, goal, linkedCompletedQuestCount, willComplete);
    return result.completion ?? null;
  }

  private async finalizeGoalProgress(
    userId: string,
    goal: GoalWithRewardRelations,
    newCurrentValue: number,
    willComplete: boolean,
  ) {
    const updated = await this.prisma.goal.update({
      where: { id: goal.id },
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

    return { goal: await this.serialize(updated), completion: undefined as CompletionResult | undefined };
  }

  /**
   * "Goal milestones" (Sprint 4): a lightweight, ordered checklist item
   * within a goal. Always appended to the end of the goal's current list -
   * reordering happens via updateMilestone's `order` field.
   */
  async addMilestone(userId: string, goalId: string, dto: CreateMilestoneDto) {
    await this.getOwnedGoal(userId, goalId);
    const order = await this.prisma.goalMilestone.count({ where: { goalId } });
    return this.prisma.goalMilestone.create({
      data: { goalId, title: dto.title, description: dto.description, xpReward: dto.xpReward ?? 0, order },
    });
  }

  /**
   * Marking a milestone complete (false -> true) awards its xpReward via the
   * normal completion workflow, unless xpReward is 0 (the default) - a pure
   * checklist item skips ProgressionService entirely, avoiding a pointless
   * zero-amount ledger row and an unnecessary achievement/level-reward
   * re-check on every tick. Un-completing (true -> false) is a plain undo -
   * it does not claw back any XP already awarded, matching how editing a
   * quest/habit never retroactively adjusts past ledger rows.
   */
  async updateMilestone(userId: string, goalId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    await this.getOwnedGoal(userId, goalId);
    const milestone = await this.getOwnedMilestone(goalId, milestoneId);

    const becomingComplete = dto.completed === true && !milestone.completed;
    const becomingIncomplete = dto.completed === false && milestone.completed;

    const updated = await this.prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.xpReward !== undefined && { xpReward: dto.xpReward }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(becomingComplete && { completed: true, completedAt: new Date() }),
        ...(becomingIncomplete && { completed: false, completedAt: null }),
      },
    });

    if (becomingComplete && updated.xpReward > 0) {
      const completion = await this.progressionService.completeActivity({
        userId,
        amount: updated.xpReward,
        sourceType: 'MILESTONE_COMPLETION',
        sourceId: updated.id,
        sourceName: updated.title,
      });
      return { milestone: updated, completion };
    }

    return { milestone: updated, completion: undefined as CompletionResult | undefined };
  }

  async removeMilestone(userId: string, goalId: string, milestoneId: string) {
    await this.getOwnedGoal(userId, goalId);
    await this.getOwnedMilestone(goalId, milestoneId);
    await this.prisma.goalMilestone.delete({ where: { id: milestoneId } });
    return { id: milestoneId, deleted: true };
  }

  private async getOwnedMilestone(goalId: string, milestoneId: string) {
    const milestone = await this.prisma.goalMilestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.goalId !== goalId) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  /** See QuestsService.assertOwnedGoal - identical check, duplicated per module rather than shared across a DI boundary. */
  private async assertOwnedSeason(userId: string, seasonId: string): Promise<void> {
    const season = await this.prisma.season.findFirst({ where: { id: seasonId, userId } });
    if (!season) throw new NotFoundException('Season not found');
  }

  private async getOwnedGoal(userId: string, id: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();
    return goal;
  }
}
