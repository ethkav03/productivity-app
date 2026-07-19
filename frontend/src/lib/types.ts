// Types mirror the backend Prisma models / serializers 1:1. Keep in sync with
// backend/prisma/schema.prisma and the response shapes returned by each module.

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  level: number;
  totalXP: number;
  currentXP: number;
  xpForNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
}

export type AttributeKey =
  | 'PHYSICAL'
  | 'INTELLIGENCE'
  | 'DISCIPLINE'
  | 'ENERGY'
  | 'SOCIAL'
  | 'WEALTH'
  | 'CREATIVITY'
  | 'WISDOM';

export interface AttributeSummary {
  id: string;
  key: AttributeKey;
  name: string;
  icon: string | null;
}

export interface Skill {
  id: string;
  userId: string;
  attributeId: string;
  attribute: AttributeSummary;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  level: number;
  totalXP: number;
  currentXP: number;
  xpForNextLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends Skill {
  weeklyXP: number;
  recentActivity: XPTransaction[];
}

/** A user's attribute record, with their skills under it nested (from GET /attributes). */
export interface Attribute {
  id: string;
  userId: string;
  key: AttributeKey;
  name: string;
  description: string | null;
  icon: string | null;
  level: number;
  totalXP: number;
  currentXP: number;
  xpForNextLevel: number;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];
}

export interface AttributeDetail extends Attribute {
  weeklyXP: number;
  recentActivity: XPTransaction[];
}

export interface DefaultSkillDefinition {
  name: string;
  description: string;
  attributeKey: AttributeKey;
}

/** GET /skills/suggestions - default skills grouped under each of the 8 fixed attributes. */
export interface DefaultAttributeGroup {
  key: AttributeKey;
  name: string;
  description: string;
  icon: string;
  skills: DefaultSkillDefinition[];
}

export type GoalType = 'NUMERIC' | 'COMPLETION' | 'BINARY';
export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: string | null;
  type: GoalType;
  status: GoalStatus;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  xpReward: number;
  startDate: string;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];
  quests?: Quest[];
  progressPercent: number;
}

export type QuestType = 'ONE_TIME' | 'RECURRING' | 'DEADLINE' | 'MILESTONE';
export type QuestDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC' | 'LEGENDARY';
export type QuestStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface Quest {
  id: string;
  userId: string;
  goalId: string | null;
  title: string;
  description: string | null;
  type: QuestType;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  xpReward: number;
  deadline: string | null;
  completedAt: string | null;
  lastCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];
  goal?: Pick<Goal, 'id' | 'title'> | null;
  completedToday?: boolean;
}

export type HabitFrequency = 'DAILY' | 'DAYS_OF_WEEK' | 'TIMES_PER_WEEK' | 'MONTHLY';

export interface Habit {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
  daysOfWeek: number[];
  timesPerWeek: number | null;
  timeOfDay: string | null;
  xpReward: number;
  isActive: boolean;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];
  completedToday: boolean;
}

export type AchievementRequirementType =
  | 'LEVEL_REACHED'
  | 'STREAK_LENGTH'
  | 'QUESTS_COMPLETED'
  | 'GOALS_COMPLETED'
  | 'HABITS_COMPLETED'
  | 'SKILL_LEVEL_REACHED'
  | 'SKILL_ACTIVITY_COUNT'
  | 'GOALS_CREATED'
  | 'ATTRIBUTE_LEVEL_REACHED';

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string | null;
  requirementType: AchievementRequirementType;
  requirementValue: number;
  skillName: string | null;
  attributeKey: AttributeKey | null;
  createdAt: string;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  unlockedAt: string;
  achievement: Achievement;
}

export type NotificationType =
  | 'HABIT_REMINDER'
  | 'QUEST_DEADLINE'
  | 'STREAK_WARNING'
  | 'LEVEL_UP'
  | 'ACHIEVEMENT_UNLOCK'
  | 'GOAL_MILESTONE';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type XPSourceType =
  | 'QUEST_COMPLETION'
  | 'HABIT_COMPLETION'
  | 'GOAL_COMPLETION'
  | 'ACHIEVEMENT_BONUS'
  | 'CORRECTION';

export interface XPTransaction {
  id: string;
  userId: string;
  skillId: string | null;
  amount: number;
  sourceType: XPSourceType;
  sourceId: string | null;
  note: string | null;
  createdAt: string;
  skill?: { id: string; name: string } | null;
  /** Best-effort human-readable title of the source quest/habit/goal, resolved server-side for feed display. */
  sourceTitle?: string | null;
}

export interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[];
  streak?: { currentStreak: number; longestStreak: number };
}

export interface AnalyticsOverview {
  level: number;
  currentXP: number;
  xpForNextLevel: number;
  totalXP: number;
  xpThisWeek: number;
  activitiesCompleted: number;
  currentStreak: number;
  longestStreak: number;
  mostImprovedSkill: string | null;
}

export interface AnalyticsXpPoint {
  date: string;
  amount: number;
}

export interface AnalyticsSkillProgress {
  skillId: string;
  name: string;
  level: number;
  totalXP: number;
  weeklyXP: number;
}

export interface AnalyticsAttributeProgress {
  attributeId: string;
  key: AttributeKey;
  name: string;
  icon: string | null;
  level: number;
  totalXP: number;
  weeklyXP: number;
}

export interface AnalyticsActivityDay {
  date: string;
  count: number;
}
