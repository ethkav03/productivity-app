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
  isAdmin: boolean;
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

/** "XP Bundles": overrides a quest/habit/goal's flat xpReward for one specific tagged skill. */
export interface SkillRewardOverride {
  skillId: string;
  amount: number;
}

/** "XP Bundles": bonus XP awarded directly to an attribute, independent of any tagged skill. */
export interface ActivityAttributeBonus {
  attributeId: string;
  attributeName: string;
  amount: number;
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
  skillRewardOverrides: SkillRewardOverride[];
  attributeBonuses: ActivityAttributeBonus[];
  quests?: Quest[];
  progressPercent: number;
}

export type QuestType = 'ONE_TIME' | 'RECURRING' | 'DEADLINE' | 'MILESTONE';
export type QuestDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC' | 'LEGENDARY';
export type QuestStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

/** "Level-gated quests": a single prerequisite a quest must satisfy before it can be completed. Which fields are set depends on `type`. */
export type QuestRequirementType = 'LEVEL_THRESHOLD' | 'ACTIVITY_COUNT' | 'ACHIEVEMENT' | 'QUEST_COMPLETED' | 'GOAL_COMPLETED';

export interface QuestRequirementInput {
  type: QuestRequirementType;
  skillId?: string;
  attributeId?: string;
  level?: number;
  count?: number;
  achievementId?: string;
  requiredQuestId?: string;
  requiredGoalId?: string;
}

/** A requirement as returned in a Quest response - evaluated server-side against the caller's current stats. */
export interface QuestRequirementStatus {
  type: QuestRequirementType;
  description: string;
  met: boolean;
  progress?: { current: number; target: number };
}

/** "Reward claiming": one completion of a quest. Completing creates this row; a separate claim step (POST /quests/:id/claim) awards XP. */
export interface QuestCompletionRecord {
  id: string;
  questId: string;
  userId: string;
  periodKey: string;
  completedAt: string;
  claimedAt: string | null;
}

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
  skillRewardOverrides: SkillRewardOverride[];
  attributeBonuses: ActivityAttributeBonus[];
  goal?: Pick<Goal, 'id' | 'title'> | null;
  completedToday?: boolean;
  /** True if any requirement is unmet - a locked quest is still returned (never hidden), just not completable yet. */
  isLocked: boolean;
  requirements: QuestRequirementStatus[];
  /** Count of completions that happened but haven't had their reward claimed yet. */
  unclaimedCompletions: number;
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
  skillRewardOverrides: SkillRewardOverride[];
  attributeBonuses: ActivityAttributeBonus[];
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
  /** The source's display name, captured at write time (e.g. a quest's title) - survives the source being renamed/deleted later. */
  sourceTitle?: string | null;
}

export type XpHistoryLineScope = 'CHARACTER' | 'SKILL' | 'ATTRIBUTE';

export interface XpHistoryLine {
  scope: XpHistoryLineScope;
  label: string;
  amount: number;
}

/** GET /analytics/xp-history - one grouped completion/correction event, with a line per level of the cascade it touched. */
export interface XpHistoryEvent {
  createdAt: string;
  sourceType: XPSourceType;
  sourceId: string | null;
  sourceName: string | null;
  note: string | null;
  lines: XpHistoryLine[];
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
  attributeKey: AttributeKey;
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

export type FriendshipStatus = 'PENDING' | 'ACCEPTED';
export type FriendRequestDirection = 'INCOMING' | 'OUTGOING';

/** Another user's profile as seen by the current user (friend requests, friends list, leaderboard) - no email/streaks. */
export interface FriendProfile {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  totalXP: number;
  currentXP: number;
  xpForNextLevel: number;
}

export interface Friend extends FriendProfile {
  friendshipId: string;
  friendSince: string | null;
}

export interface FriendRequest {
  id: string;
  status: FriendshipStatus;
  direction: FriendRequestDirection;
  createdAt: string;
  user: FriendProfile;
}

export type LeaderboardMetric = 'LEVEL' | 'ATTRIBUTE' | 'XP';
export type LeaderboardPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL_TIME';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  isCurrentUser: boolean;
  /** The ranked value itself - character level, attribute level, or XP earned, depending on the selected metric. */
  value: number;
  characterLevel: number;
}

/** GET /admin/users, and the shape returned by most /admin/users/:id mutations - same as PublicUser. */
export type AdminUserSummary = PublicUser;

export interface AdminAttributeSummary {
  id: string;
  key: AttributeKey;
  name: string;
  level: number;
  totalXP: number;
}

export interface AdminUnlockedAchievement {
  id: string;
  achievementId: string;
  unlockedAt: string;
  achievement: Achievement;
}

/** GET /admin/users/:id */
export interface AdminUserDetail extends PublicUser {
  skillCount: number;
  friendCount: number;
  attributes: AdminAttributeSummary[];
  unlockedAchievements: AdminUnlockedAchievement[];
}

/** POST /admin/users/:id/xp */
export interface AdminCorrectionResult {
  scope: 'CHARACTER' | 'ATTRIBUTE';
  attributeId?: string;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  totalXP: number;
}

export interface AdminFriendshipParty {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
}

/** GET /admin/friendships, and the create/accept mutations - admin can see/act on any pair, not just their own. */
export interface AdminFriendship {
  id: string;
  status: FriendshipStatus;
  createdAt: string;
  respondedAt: string | null;
  requester: AdminFriendshipParty;
  addressee: AdminFriendshipParty;
}
