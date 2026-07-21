import { Injectable } from '@nestjs/common';
import { QuestDifficulty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findNeglectedAttribute } from '../common/neglected-attribute';

const DEADLINE_LOOKAHEAD_HOURS = 48;
const STALE_GOAL_DAYS = 14;
const READY_FOR_CHALLENGE_SAMPLE = 5;
const EASY_DIFFICULTIES: QuestDifficulty[] = ['EASY', 'MEDIUM'];

export type RecommendationType =
  | 'NEGLECTED_ATTRIBUTE'
  | 'MOMENTUM'
  | 'DEADLINE_SOON'
  | 'STALE_GOAL'
  | 'DIFFICULTY_READY';

export interface RecommendationCard {
  type: RecommendationType;
  title: string;
  description: string;
  attributeId?: string;
  skillId?: string;
  questId?: string;
  goalId?: string;
}

/**
 * "Personalised Recommendations" (Feature 20) and "Adaptive Difficulty"
 * (Feature 21), built as fixed rules-based heuristics rather than an LLM -
 * there is no AI/LLM integration anywhere in this app (that's explicitly
 * Phase 4's "AI Game Master", deliberately not built - see the
 * deliberate-deviation note in docs/feature-roadmap.md § "Feature 22").
 * Each heuristic below is independent and returns null when its own signal
 * isn't strong enough to be worth surfacing, rather than always producing a
 * card from noise.
 */
@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(userId: string): Promise<RecommendationCard[]> {
    const cards = await Promise.all([
      this.neglectedAttributeCard(userId),
      this.momentumCard(userId),
      this.deadlineSoonCard(userId),
      this.staleGoalCard(userId),
      this.difficultyReadyCard(userId),
    ]);

    return cards.filter((card): card is RecommendationCard => card !== null);
  }

  private async neglectedAttributeCard(userId: string): Promise<RecommendationCard | null> {
    const neglected = await findNeglectedAttribute(this.prisma, userId, { requireSkill: true });
    if (!neglected || !neglected.skill || neglected.windowXp > 0) return null;

    return {
      type: 'NEGLECTED_ATTRIBUTE',
      title: 'Balance your build',
      description: `${neglected.attributeName} hasn't earned any XP this week. Try a ${neglected.skill.name} activity.`,
      attributeId: neglected.attributeId,
      skillId: neglected.skill.id,
    };
  }

  private async momentumCard(userId: string): Promise<RecommendationCard | null> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const top = await this.topSkillOfTheWeek(userId, weekAgo);
    if (!top) return null;

    return {
      type: 'MOMENTUM',
      title: "You're on a roll",
      description: `You've earned ${top.xp} XP in ${top.name} this week - keep it going.`,
      skillId: top.id,
    };
  }

  private async deadlineSoonCard(userId: string): Promise<RecommendationCard | null> {
    const now = new Date();
    const lookahead = new Date(now.getTime() + DEADLINE_LOOKAHEAD_HOURS * 60 * 60 * 1000);
    const quest = await this.prisma.quest.findFirst({
      where: { userId, status: 'ACTIVE', deadline: { gte: now, lte: lookahead } },
      orderBy: { deadline: 'asc' },
    });
    if (!quest?.deadline) return null;

    const hoursLeft = Math.max(1, Math.round((quest.deadline.getTime() - now.getTime()) / (60 * 60 * 1000)));
    const timeLeft =
      hoursLeft < 24
        ? `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
        : `${Math.round(hoursLeft / 24)} day${Math.round(hoursLeft / 24) === 1 ? '' : 's'}`;

    return {
      type: 'DEADLINE_SOON',
      title: 'Deadline approaching',
      description: `"${quest.title}" is due in ${timeLeft}.`,
      questId: quest.id,
    };
  }

  private async staleGoalCard(userId: string): Promise<RecommendationCard | null> {
    const staleBefore = new Date(Date.now() - STALE_GOAL_DAYS * 24 * 60 * 60 * 1000);
    const goal = await this.prisma.goal.findFirst({
      where: { userId, status: 'ACTIVE', updatedAt: { lt: staleBefore } },
      orderBy: { updatedAt: 'asc' },
    });
    if (!goal) return null;

    return {
      type: 'STALE_GOAL',
      title: 'Goal needs attention',
      description: `"${goal.title}" hasn't moved in over ${STALE_GOAL_DAYS} days.`,
      goalId: goal.id,
    };
  }

  /**
   * Honestly rescoped "Adaptive Difficulty": there is no failure/abandon
   * signal in the data model to detect "the user keeps failing a
   * difficulty" - deleting a quest is indistinguishable from never having
   * created one, and QuestStatus.ARCHIVED is defined but never actually set
   * anywhere. What IS real: if the last READY_FOR_CHALLENGE_SAMPLE claimed
   * completions were all Easy/Medium, the user has been coasting - surface a
   * nudge toward a harder quest. The inverse (recommend reducing the target
   * after repeated failure) is not built - see docs/feature-roadmap.md
   * § "Feature 21".
   */
  private async difficultyReadyCard(userId: string): Promise<RecommendationCard | null> {
    const recent = await this.prisma.questCompletion.findMany({
      where: { userId, claimedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: READY_FOR_CHALLENGE_SAMPLE,
      include: { quest: { select: { difficulty: true } } },
    });
    if (recent.length < READY_FOR_CHALLENGE_SAMPLE) return null;

    const allEasy = recent.every((completion) => EASY_DIFFICULTIES.includes(completion.quest.difficulty));
    if (!allEasy) return null;

    return {
      type: 'DIFFICULTY_READY',
      title: 'Ready for a challenge?',
      description: `Your last ${READY_FOR_CHALLENGE_SAMPLE} completed quests were all Easy or Medium - maybe it's time to try a Hard one.`,
    };
  }

  /**
   * "AI Game Master" (Feature 22), narrowed to its one honestly-buildable
   * piece without an LLM: a structured weekly digest of data that already
   * exists, not AI-written narrative prose. Quest generation and narrative
   * synthesis are deliberately not built - see docs/feature-roadmap.md
   * § "Feature 22".
   */
  async getWeeklyReview(userId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [user, xpThisWeekAgg, xpLastWeekAgg, questsCompleted, habitsCompleted, mostImprovedSkill, neglected] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        this.prisma.xPTransaction.aggregate({
          where: { userId, skillId: null, attributeId: null, createdAt: { gte: weekAgo } },
          _sum: { amount: true },
        }),
        this.prisma.xPTransaction.aggregate({
          where: { userId, skillId: null, attributeId: null, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
          _sum: { amount: true },
        }),
        this.prisma.questCompletion.count({ where: { userId, completedAt: { gte: weekAgo } } }),
        this.prisma.habitCompletion.count({ where: { userId, completedAt: { gte: weekAgo } } }),
        this.topSkillOfTheWeek(userId, weekAgo),
        findNeglectedAttribute(this.prisma, userId),
      ]);

    const xpThisWeek = xpThisWeekAgg._sum.amount ?? 0;
    const xpLastWeek = xpLastWeekAgg._sum.amount ?? 0;

    return {
      xpThisWeek,
      xpLastWeek,
      xpDelta: xpThisWeek - xpLastWeek,
      questsCompleted,
      habitsCompleted,
      mostImprovedSkill,
      neglectedAttribute: neglected
        ? { id: neglected.attributeId, key: neglected.attributeKey, name: neglected.attributeName }
        : null,
      currentStreak: user.currentStreak,
    };
  }

  private async topSkillOfTheWeek(
    userId: string,
    weekAgo: Date,
  ): Promise<{ id: string; name: string; xp: number } | null> {
    const topSkillGroup = await this.prisma.xPTransaction.groupBy({
      by: ['skillId'],
      where: { userId, skillId: { not: null }, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 1,
    });

    const top = topSkillGroup[0];
    const xp = top?._sum.amount ?? 0;
    if (!top?.skillId || xp <= 0) return null;

    const skill = await this.prisma.skill.findUnique({ where: { id: top.skillId } });
    if (!skill) return null;

    return { id: skill.id, name: skill.name, xp };
  }
}
