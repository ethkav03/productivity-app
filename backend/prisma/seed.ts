import { PrismaClient, AchievementRequirementType, AttributeKey } from '@prisma/client';

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
