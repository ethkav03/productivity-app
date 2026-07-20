import { PrismaService } from '../prisma/prisma.service';
import { QuestRequirement, QuestRequirementType } from '@prisma/client';

export interface RequirementEvaluation {
  type: QuestRequirementType;
  description: string;
  met: boolean;
  progress?: { current: number; target: number };
}

/**
 * Everything needed to evaluate every requirement on every quest for one
 * user, fetched once per list/detail request rather than once per quest -
 * follows the same data-driven-condition shape as
 * AchievementsService.isConditionMet, just batched up front to avoid N+1
 * queries across a whole quest list.
 */
interface RequirementSnapshot {
  characterLevel: number;
  skillLevels: Map<string, { level: number; name: string }>;
  attributeLevels: Map<string, { level: number; name: string }>;
  skillActivityCounts: Map<string, number>;
  unlockedAchievements: Map<string, string>;
  completedQuests: Map<string, string>;
  completedGoals: Map<string, string>;
}

export async function buildRequirementSnapshot(prisma: PrismaService, userId: string): Promise<RequirementSnapshot> {
  const [user, skills, attributes, activityCounts, unlockedAchievements, quests, completedGoals] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } }),
    prisma.skill.findMany({ where: { userId }, select: { id: true, level: true, name: true } }),
    prisma.attribute.findMany({ where: { userId }, select: { id: true, level: true, name: true } }),
    prisma.xPTransaction.groupBy({ by: ['skillId'], where: { userId, skillId: { not: null } }, _count: { _all: true } }),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievement: { select: { id: true, name: true } } } }),
    prisma.quest.findMany({ where: { userId }, select: { id: true, title: true, status: true, lastCompletedAt: true } }),
    prisma.goal.findMany({ where: { userId, status: 'COMPLETED' }, select: { id: true, title: true } }),
  ]);

  // A quest counts as "completed" for QUEST_COMPLETED requirements if it's
  // reached COMPLETED status (one-time/deadline/milestone) or has been
  // completed at least once (recurring quests never set status: COMPLETED).
  const completedQuests = new Map(
    quests
      .filter((quest) => quest.status === 'COMPLETED' || quest.lastCompletedAt !== null)
      .map((quest) => [quest.id, quest.title]),
  );

  return {
    characterLevel: user.level,
    skillLevels: new Map(skills.map((skill) => [skill.id, { level: skill.level, name: skill.name }])),
    attributeLevels: new Map(attributes.map((attribute) => [attribute.id, { level: attribute.level, name: attribute.name }])),
    skillActivityCounts: new Map(activityCounts.map((row) => [row.skillId as string, row._count._all])),
    unlockedAchievements: new Map(unlockedAchievements.map((row) => [row.achievement.id, row.achievement.name])),
    completedQuests,
    completedGoals: new Map(completedGoals.map((goal) => [goal.id, goal.title])),
  };
}

/**
 * Requirement rows as read from Prisma, with the display names of whatever
 * they reference (skill/attribute/achievement/quest/goal) - needed for
 * human-readable descriptions without extra lookups per requirement.
 */
type RequirementWithNames = QuestRequirement & {
  skill: { name: string } | null;
  attribute: { name: string } | null;
  achievement: { name: string } | null;
  requiredQuest: { title: string } | null;
  requiredGoal: { title: string } | null;
};

export function evaluateRequirement(requirement: RequirementWithNames, snapshot: RequirementSnapshot): RequirementEvaluation {
  switch (requirement.type) {
    case 'LEVEL_THRESHOLD': {
      const target = requirement.level ?? 1;
      if (requirement.skillId) {
        const current = snapshot.skillLevels.get(requirement.skillId)?.level ?? 0;
        return {
          type: requirement.type,
          description: `${requirement.skill?.name ?? 'Skill'} Level ${target}`,
          met: current >= target,
          progress: { current, target },
        };
      }
      if (requirement.attributeId) {
        const current = snapshot.attributeLevels.get(requirement.attributeId)?.level ?? 0;
        return {
          type: requirement.type,
          description: `${requirement.attribute?.name ?? 'Attribute'} Level ${target}`,
          met: current >= target,
          progress: { current, target },
        };
      }
      return {
        type: requirement.type,
        description: `Character Level ${target}`,
        met: snapshot.characterLevel >= target,
        progress: { current: snapshot.characterLevel, target },
      };
    }
    case 'ACTIVITY_COUNT': {
      const target = requirement.count ?? 1;
      const current = requirement.skillId ? (snapshot.skillActivityCounts.get(requirement.skillId) ?? 0) : 0;
      return {
        type: requirement.type,
        description: `Complete ${target} ${requirement.skill?.name ?? 'tagged'} activities`,
        met: current >= target,
        progress: { current, target },
      };
    }
    case 'ACHIEVEMENT': {
      const met = !!requirement.achievementId && snapshot.unlockedAchievements.has(requirement.achievementId);
      return {
        type: requirement.type,
        description: `Achievement: ${requirement.achievement?.name ?? 'Unknown'}`,
        met,
      };
    }
    case 'QUEST_COMPLETED': {
      const met = !!requirement.requiredQuestId && snapshot.completedQuests.has(requirement.requiredQuestId);
      return {
        type: requirement.type,
        description: `Complete Quest: ${requirement.requiredQuest?.title ?? 'Unknown'}`,
        met,
      };
    }
    case 'GOAL_COMPLETED': {
      const met = !!requirement.requiredGoalId && snapshot.completedGoals.has(requirement.requiredGoalId);
      return {
        type: requirement.type,
        description: `Complete Goal: ${requirement.requiredGoal?.title ?? 'Unknown'}`,
        met,
      };
    }
    default:
      return { type: requirement.type, description: 'Unknown requirement', met: false };
  }
}

export function evaluateRequirements(requirements: RequirementWithNames[], snapshot: RequirementSnapshot) {
  const evaluated = requirements.map((requirement) => evaluateRequirement(requirement, snapshot));
  return { requirements: evaluated, isLocked: evaluated.some((requirement) => !requirement.met) };
}
