import { AttributeKey, QuestDifficulty } from '@/lib/types';

export interface StarterQuestTemplate {
  title: string;
  description: string;
  difficulty: QuestDifficulty;
}

/**
 * Curated starter-quest ideas per attribute, shown in onboarding so a new
 * user doesn't have to think up their own quests from a blank page. Keyed by
 * attribute rather than individual skill, since a user's chosen skills
 * within one attribute vary too much to give each its own quest ideas -
 * only the first template is auto-populated, the rest exist so the list
 * doesn't feel identical every time.
 */
const STARTER_QUESTS_BY_ATTRIBUTE: Record<AttributeKey, StarterQuestTemplate[]> = {
  PHYSICAL: [
    { title: 'Do a 20-minute workout', description: 'Any activity that gets your heart rate up counts.', difficulty: 'EASY' },
    { title: 'Go for a walk or run', description: 'Aim for at least 2km, indoors or out.', difficulty: 'EASY' },
  ],
  INTELLIGENCE: [
    { title: 'Learn something new for 20 minutes', description: 'An article, video, course, or book chapter - anything that teaches you something.', difficulty: 'EASY' },
    { title: 'Solve a challenging problem', description: "A puzzle, a bug, a real problem you've been putting off.", difficulty: 'MEDIUM' },
  ],
  DISCIPLINE: [
    { title: 'Complete your top priority task before noon', description: "Pick the one thing you'd be relieved to have done.", difficulty: 'MEDIUM' },
    { title: 'Say no to one distraction today', description: 'Notice the urge, and choose not to follow it.', difficulty: 'EASY' },
  ],
  ENERGY: [
    { title: 'Get 8 hours of sleep tonight', description: 'Set an alarm for your bedtime, not just your wake time.', difficulty: 'EASY' },
    { title: 'Cook a healthy meal from scratch', description: 'Pick something with at least one vegetable.', difficulty: 'MEDIUM' },
  ],
  SOCIAL: [
    { title: 'Start a conversation with someone new', description: "Doesn't have to be deep - just say hello.", difficulty: 'MEDIUM' },
    { title: 'Speak up in a meeting or group', description: 'Share one opinion or question out loud.', difficulty: 'MEDIUM' },
  ],
  WEALTH: [
    { title: 'Track your spending for a day', description: 'Write down every purchase, even the small ones.', difficulty: 'EASY' },
    { title: 'Review your budget and cut one expense', description: 'Find one recurring cost you can drop or shrink.', difficulty: 'MEDIUM' },
  ],
  CREATIVITY: [
    { title: 'Spend 30 minutes on a creative project', description: 'Draw, write, play, build - whatever is yours.', difficulty: 'EASY' },
    { title: 'Try a new creative technique or medium', description: "Something you've never done before, even badly.", difficulty: 'MEDIUM' },
  ],
  WISDOM: [
    { title: 'Meditate for 10 minutes', description: 'A timer and a quiet spot is all you need.', difficulty: 'EASY' },
    { title: "Write down 3 things you're grateful for", description: 'Keep it specific - "my coffee this morning" counts.', difficulty: 'EASY' },
  ],
};

const MAX_AUTO_POPULATED_QUESTS = 4;

export function getStarterQuestTemplates(attributeKey: AttributeKey): StarterQuestTemplate[] {
  return STARTER_QUESTS_BY_ATTRIBUTE[attributeKey];
}

/**
 * Picks one starter-quest suggestion per distinct attribute represented by
 * the user's selected skills (capped so the list stays skimmable) to
 * auto-populate onboarding's activities step.
 */
export function buildStarterQuests(selectedAttributeKeys: AttributeKey[]): StarterQuestTemplate[] {
  const distinctKeys = Array.from(new Set(selectedAttributeKeys));
  return distinctKeys.slice(0, MAX_AUTO_POPULATED_QUESTS).map((key) => getStarterQuestTemplates(key)[0]);
}
