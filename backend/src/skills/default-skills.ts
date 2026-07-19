export interface DefaultSkillDefinition {
  name: string;
  description: string;
  icon: string;
}

/** Suggested skills shown during onboarding (MVP spec section 6). Users may pick any subset or create custom ones. */
export const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  { name: 'Fitness', description: 'Physical training, strength, and endurance.', icon: 'dumbbell' },
  { name: 'Nutrition', description: 'Diet quality and eating habits.', icon: 'apple' },
  { name: 'Sleep', description: 'Rest quality and consistency.', icon: 'moon' },
  { name: 'Mental Wellbeing', description: 'Mindfulness, stress management, and mental health.', icon: 'brain' },
  { name: 'Discipline', description: 'Consistency and follow-through on commitments.', icon: 'shield' },
  { name: 'Productivity', description: 'Getting meaningful work done.', icon: 'check-square' },
  { name: 'Confidence', description: 'Self-belief and social courage.', icon: 'sparkles' },
  { name: 'Programming', description: 'Software development skills.', icon: 'code' },
  { name: 'Languages', description: 'Learning and practicing new languages.', icon: 'languages' },
  { name: 'Reading', description: 'Books and long-form learning.', icon: 'book-open' },
  { name: 'Finance', description: 'Saving, investing, and money management.', icon: 'wallet' },
  { name: 'Creativity', description: 'Art, music, writing, and creative projects.', icon: 'palette' },
];
