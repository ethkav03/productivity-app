import { PrismaClient, AchievementRequirementType, AttributeKey, LevelRewardType } from '@prisma/client';

const prisma = new PrismaClient();

interface AchievementSeed {
  key: string;
  name: string;
  description: string;
  requirementType: AchievementRequirementType;
  requirementValue: number;
  skillName?: string;
  attributeKey?: AttributeKey;
  icon?: string;
}

interface LevelRewardSeed {
  key: string;
  name: string;
  description: string;
  icon?: string;
  type: LevelRewardType;
  attributeKey?: AttributeKey; // omitted = character-level reward
  level: number;
}

// MVP spec section 10 - kept data-driven so new achievements can be added without code changes.
const ACHIEVEMENTS: AchievementSeed[] = [
  { key: 'first-steps', name: 'First Steps', description: 'Complete your first quest.', requirementType: 'QUESTS_COMPLETED', requirementValue: 1, icon: 'footprints' },
  { key: 'quest-hunter', name: 'Quest Hunter', description: 'Complete 100 quests.', requirementType: 'QUESTS_COMPLETED', requirementValue: 100, icon: 'swords' },
  { key: 'level-10', name: 'Level 10', description: 'Reach Level 10.', requirementType: 'LEVEL_REACHED', requirementValue: 10, icon: 'star' },
  { key: 'veteran', name: 'Veteran', description: 'Reach Level 25.', requirementType: 'LEVEL_REACHED', requirementValue: 25, icon: 'award' },
  { key: 'consistent', name: 'Consistent', description: 'Maintain a 7-day streak.', requirementType: 'STREAK_LENGTH', requirementValue: 7, icon: 'flame' },
  { key: 'dedicated', name: 'Dedicated', description: 'Maintain a 30-day streak.', requirementType: 'STREAK_LENGTH', requirementValue: 30, icon: 'flame' },
  { key: 'getting-physical', name: 'Getting Physical', description: 'Reach Physical Level 2.', requirementType: 'ATTRIBUTE_LEVEL_REACHED', requirementValue: 2, attributeKey: 'PHYSICAL', icon: 'dumbbell' },
  { key: 'sharp-mind', name: 'Sharp Mind', description: 'Reach Intelligence Level 5.', requirementType: 'ATTRIBUTE_LEVEL_REACHED', requirementValue: 5, attributeKey: 'INTELLIGENCE', icon: 'brain' },
  { key: 'iron-will', name: 'Iron Will', description: 'Reach Discipline Level 5.', requirementType: 'ATTRIBUTE_LEVEL_REACHED', requirementValue: 5, attributeKey: 'DISCIPLINE', icon: 'shield' },
  { key: 'goal-setter', name: 'Goal Setter', description: 'Create your first goal.', requirementType: 'GOALS_CREATED', requirementValue: 1, icon: 'flag' },
  { key: 'finisher', name: 'Finisher', description: 'Complete your first goal.', requirementType: 'GOALS_COMPLETED', requirementValue: 1, icon: 'trophy' },
  { key: 'overachiever', name: 'Overachiever', description: 'Complete 10 goals.', requirementType: 'GOALS_COMPLETED', requirementValue: 10, icon: 'trophy' },
  { key: 'habit-forming', name: 'Habit Forming', description: 'Complete a habit 30 times.', requirementType: 'HABITS_COMPLETED', requirementValue: 30, icon: 'repeat' },
];

// "Level-Up Rewards" (Sprint 3 Feature 6) - a modest, representative set covering all 5 built
// reward types and both scopes (character / a fixed attribute), not exhaustive content
// authoring. Deliberately low thresholds to match the achievement seed's own low bar
// (e.g. getting-physical at Physical Level 2) so this is easy to reach and verify.
const LEVEL_REWARDS: LevelRewardSeed[] = [
  { key: 'title-beginner', name: 'The Beginner', description: 'Reach Character Level 3.', type: 'TITLE', level: 3, icon: 'sparkles' },
  { key: 'title-consistent', name: 'The Consistent', description: 'Reach Character Level 6.', type: 'TITLE', level: 6, icon: 'flame' },
  { key: 'physical-badge', name: 'Getting Stronger', description: 'Reach Physical Level 2.', type: 'BADGE', attributeKey: 'PHYSICAL', level: 2, icon: 'dumbbell' },
  { key: 'discipline-streak-protection', name: 'Streak Protection', description: 'Reach Discipline Level 3 - protects your next habit streak from breaking on a missed day.', type: 'STREAK_PROTECTION', attributeKey: 'DISCIPLINE', level: 3, icon: 'shield' },
  { key: 'intelligence-study-plans', name: 'Study Plans', description: 'Reach Intelligence Level 3.', type: 'FEATURE_UNLOCK', attributeKey: 'INTELLIGENCE', level: 3, icon: 'book-open' },
  { key: 'physical-epic-quest', name: 'Epic Physical Quest', description: 'Reach Physical Level 3 - unlocks a curated Epic quest.', type: 'QUEST', attributeKey: 'PHYSICAL', level: 3, icon: 'swords' },
];

async function main() {
  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      update: achievement,
      create: achievement,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${ACHIEVEMENTS.length} achievements.`);

  for (const reward of LEVEL_REWARDS) {
    await prisma.levelReward.upsert({
      where: { key: reward.key },
      update: reward,
      create: reward,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${LEVEL_REWARDS.length} level rewards.`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
