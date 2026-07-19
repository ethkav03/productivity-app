import { QuestDifficulty } from '@/lib/types';

export interface StarterQuestTemplate {
  title: string;
  description: string;
  difficulty: QuestDifficulty;
}

/**
 * Curated starter-quest ideas per default skill, shown in onboarding so a
 * new user doesn't have to think up their own quests from a blank page.
 * Each skill lists a couple of options; only the first is auto-populated,
 * the rest exist so a returning/re-rolled selection still feels fresh.
 */
const STARTER_QUESTS_BY_SKILL: Record<string, StarterQuestTemplate[]> = {
  Fitness: [
    { title: 'Do a 20-minute workout', description: 'Any activity that gets your heart rate up counts.', difficulty: 'EASY' },
    { title: 'Go for a walk or run', description: 'Aim for at least 2km, indoors or out.', difficulty: 'EASY' },
  ],
  Nutrition: [
    { title: 'Log everything you eat for a day', description: 'Just notice - no need to change anything yet.', difficulty: 'EASY' },
    { title: 'Cook a healthy meal from scratch', description: 'Pick something with at least one vegetable.', difficulty: 'MEDIUM' },
  ],
  Sleep: [
    { title: 'Get 8 hours of sleep tonight', description: 'Set an alarm for your bedtime, not just your wake time.', difficulty: 'EASY' },
    { title: 'Set a consistent bedtime this week', description: 'Same time, every night, weekends included.', difficulty: 'MEDIUM' },
  ],
  'Mental Wellbeing': [
    { title: 'Meditate for 10 minutes', description: 'A timer and a quiet spot is all you need.', difficulty: 'EASY' },
    { title: "Write down 3 things you're grateful for", description: 'Keep it specific - "my coffee this morning" counts.', difficulty: 'EASY' },
  ],
  Discipline: [
    { title: 'Complete your top priority task before noon', description: 'Pick the one thing you\'d be relieved to have done.', difficulty: 'MEDIUM' },
    { title: 'Say no to one distraction today', description: 'Notice the urge, and choose not to follow it.', difficulty: 'EASY' },
  ],
  Productivity: [
    { title: 'Plan tomorrow before you go to bed', description: "Three tasks, written down, before you're too tired to think.", difficulty: 'EASY' },
    { title: 'Clear your inbox to zero', description: 'Reply, archive, or delete - just get to zero once.', difficulty: 'MEDIUM' },
  ],
  Confidence: [
    { title: 'Start a conversation with someone new', description: "Doesn't have to be deep - just say hello.", difficulty: 'MEDIUM' },
    { title: 'Speak up in a meeting or group', description: 'Share one opinion or question out loud.', difficulty: 'MEDIUM' },
  ],
  Programming: [
    { title: 'Complete one coding tutorial lesson', description: 'Pick up where you left off, or start something new.', difficulty: 'EASY' },
    { title: 'Build and ship a small script or feature', description: 'Small and finished beats big and abandoned.', difficulty: 'MEDIUM' },
  ],
  Languages: [
    { title: 'Complete a 15-minute lesson', description: 'Duolingo, a textbook, an app - whatever you use.', difficulty: 'EASY' },
    { title: 'Have a 5-minute conversation in your target language', description: 'With a person, a tutor, or an AI - it all counts.', difficulty: 'MEDIUM' },
  ],
  Reading: [
    { title: 'Read 20 pages', description: 'Of whatever book you have going right now.', difficulty: 'EASY' },
    { title: 'Finish a chapter', description: 'Pick a natural stopping point and reach it.', difficulty: 'EASY' },
  ],
  Finance: [
    { title: 'Track your spending for a day', description: 'Write down every purchase, even the small ones.', difficulty: 'EASY' },
    { title: 'Review your budget and cut one expense', description: 'Find one recurring cost you can drop or shrink.', difficulty: 'MEDIUM' },
  ],
  Creativity: [
    { title: 'Spend 30 minutes on a creative project', description: 'Draw, write, play, build - whatever is yours.', difficulty: 'EASY' },
    { title: 'Try a new creative technique or medium', description: 'Something you\'ve never done before, even badly.', difficulty: 'MEDIUM' },
  ],
};

const GENERIC_STARTER_QUESTS = (skillName: string): StarterQuestTemplate[] => [
  { title: `Spend 20 minutes on ${skillName}`, description: 'A focused, uninterrupted block of time.', difficulty: 'EASY' },
  { title: `Complete one session of ${skillName}`, description: 'Whatever "one session" means for this skill.', difficulty: 'MEDIUM' },
];

const MAX_AUTO_POPULATED_QUESTS = 4;

export function getStarterQuestTemplates(skillName: string): StarterQuestTemplate[] {
  return STARTER_QUESTS_BY_SKILL[skillName] ?? GENERIC_STARTER_QUESTS(skillName);
}

/**
 * Picks one starter-quest suggestion per selected skill (capped so the list
 * stays skimmable) to auto-populate onboarding's activities step.
 */
export function buildStarterQuests(selectedSkillNames: string[]): StarterQuestTemplate[] {
  return selectedSkillNames.slice(0, MAX_AUTO_POPULATED_QUESTS).map((name) => getStarterQuestTemplates(name)[0]);
}
