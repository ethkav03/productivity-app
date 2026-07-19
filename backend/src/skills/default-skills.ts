import { AttributeKey } from '@prisma/client';

export interface DefaultSkillDefinition {
  name: string;
  description: string;
  attributeKey: AttributeKey;
}

/**
 * Suggested skills shown during onboarding and in the "Add Skill" picker,
 * grouped under the 8 fixed attributes. Users may pick any subset or create
 * custom ones. The same skill name can appear under more than one attribute
 * (e.g. "Focus" under both Intelligence and Discipline) as distinct stats -
 * the schema scopes skill-name uniqueness per attribute, not just per user.
 */
export const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  // Physical
  { name: 'Strength', description: 'Ability to produce force', attributeKey: 'PHYSICAL' },
  { name: 'Endurance', description: 'Ability to sustain physical activity', attributeKey: 'PHYSICAL' },
  { name: 'Speed', description: 'How quickly you can move', attributeKey: 'PHYSICAL' },
  { name: 'Agility', description: 'Coordination and ability to change direction', attributeKey: 'PHYSICAL' },
  { name: 'Mobility', description: 'Range of motion and movement quality', attributeKey: 'PHYSICAL' },
  { name: 'Balance', description: 'Stability and body control', attributeKey: 'PHYSICAL' },
  { name: 'Coordination', description: 'Ability to control complex movements', attributeKey: 'PHYSICAL' },
  { name: 'Health', description: 'Overall physical condition', attributeKey: 'PHYSICAL' },
  { name: 'Recovery', description: 'Ability to recover from exercise and fatigue', attributeKey: 'PHYSICAL' },
  { name: 'Appearance', description: 'Physical presentation and body composition', attributeKey: 'PHYSICAL' },

  // Intelligence
  { name: 'Knowledge', description: 'Information you have learned', attributeKey: 'INTELLIGENCE' },
  { name: 'Learning', description: 'How effectively you acquire new skills', attributeKey: 'INTELLIGENCE' },
  { name: 'Logic', description: 'Reasoning and structured thinking', attributeKey: 'INTELLIGENCE' },
  { name: 'Problem Solving', description: 'Ability to overcome complex challenges', attributeKey: 'INTELLIGENCE' },
  { name: 'Memory', description: 'Ability to retain and recall information', attributeKey: 'INTELLIGENCE' },
  { name: 'Focus', description: 'Ability to concentrate on a task', attributeKey: 'INTELLIGENCE' },
  { name: 'Critical Thinking', description: 'Evaluating information and identifying flaws', attributeKey: 'INTELLIGENCE' },
  { name: 'Technical Skill', description: 'Ability to understand complex systems', attributeKey: 'INTELLIGENCE' },
  { name: 'Adaptability', description: 'Ability to learn and adjust to new situations', attributeKey: 'INTELLIGENCE' },

  // Discipline
  { name: 'Consistency', description: 'Repeatedly doing something over time', attributeKey: 'DISCIPLINE' },
  { name: 'Self-Control', description: 'Resisting short-term temptations', attributeKey: 'DISCIPLINE' },
  { name: 'Focus', description: 'Staying on one task', attributeKey: 'DISCIPLINE' },
  { name: 'Routine', description: 'Maintaining structured habits', attributeKey: 'DISCIPLINE' },
  { name: 'Persistence', description: 'Continuing despite difficulty', attributeKey: 'DISCIPLINE' },
  { name: 'Time Management', description: 'Using time effectively', attributeKey: 'DISCIPLINE' },
  { name: 'Delayed Gratification', description: 'Sacrificing short-term pleasure for long-term reward', attributeKey: 'DISCIPLINE' },
  { name: 'Execution', description: 'Turning plans into completed actions', attributeKey: 'DISCIPLINE' },
  { name: 'Reliability', description: 'Doing what you said you would do', attributeKey: 'DISCIPLINE' },

  // Energy
  { name: 'Sleep', description: 'Quality and consistency of sleep', attributeKey: 'ENERGY' },
  { name: 'Vitality', description: 'General physical energy', attributeKey: 'ENERGY' },
  { name: 'Mental Energy', description: 'Capacity for thinking and concentrating', attributeKey: 'ENERGY' },
  { name: 'Recovery', description: 'Ability to restore energy', attributeKey: 'ENERGY' },
  { name: 'Stress Management', description: 'Ability to prevent energy drain', attributeKey: 'ENERGY' },
  { name: 'Nutrition', description: 'Fuel quality and consistency', attributeKey: 'ENERGY' },
  { name: 'Health Maintenance', description: 'Managing factors that affect energy', attributeKey: 'ENERGY' },
  { name: 'Work Capacity', description: 'How much you can accomplish before exhaustion', attributeKey: 'ENERGY' },

  // Social
  { name: 'Communication', description: 'Clearly expressing yourself', attributeKey: 'SOCIAL' },
  { name: 'Conversation', description: 'Ability to hold engaging conversations', attributeKey: 'SOCIAL' },
  { name: 'Confidence', description: 'Comfort in social situations', attributeKey: 'SOCIAL' },
  { name: 'Charisma', description: 'Ability to attract and engage others', attributeKey: 'SOCIAL' },
  { name: 'Empathy', description: "Understanding other people's emotions", attributeKey: 'SOCIAL' },
  { name: 'Listening', description: 'Ability to properly understand others', attributeKey: 'SOCIAL' },
  { name: 'Humour', description: 'Ability to create enjoyment and connection', attributeKey: 'SOCIAL' },
  { name: 'Networking', description: 'Building useful relationships', attributeKey: 'SOCIAL' },
  { name: 'Leadership', description: 'Influencing and guiding others', attributeKey: 'SOCIAL' },
  { name: 'Conflict Resolution', description: 'Handling disagreements effectively', attributeKey: 'SOCIAL' },
  { name: 'Relationships', description: 'Maintaining meaningful connections', attributeKey: 'SOCIAL' },

  // Wealth
  { name: 'Income', description: 'Your ability to generate money', attributeKey: 'WEALTH' },
  { name: 'Career', description: 'Progression in your profession', attributeKey: 'WEALTH' },
  { name: 'Financial Knowledge', description: 'Understanding money and finance', attributeKey: 'WEALTH' },
  { name: 'Budgeting', description: 'Managing your income and expenses', attributeKey: 'WEALTH' },
  { name: 'Saving', description: 'Building financial reserves', attributeKey: 'WEALTH' },
  { name: 'Investing', description: 'Growing wealth over time', attributeKey: 'WEALTH' },
  { name: 'Entrepreneurship', description: 'Creating businesses or income streams', attributeKey: 'WEALTH' },
  { name: 'Negotiation', description: 'Improving financial outcomes', attributeKey: 'WEALTH' },
  { name: 'Career Skills', description: 'Skills that increase your earning potential', attributeKey: 'WEALTH' },
  { name: 'Financial Security', description: 'How resilient you are to unexpected costs', attributeKey: 'WEALTH' },

  // Creativity
  { name: 'Ideation', description: 'Generating new ideas', attributeKey: 'CREATIVITY' },
  { name: 'Imagination', description: 'Creating possibilities mentally', attributeKey: 'CREATIVITY' },
  { name: 'Innovation', description: 'Finding new solutions', attributeKey: 'CREATIVITY' },
  { name: 'Expression', description: 'Communicating ideas creatively', attributeKey: 'CREATIVITY' },
  { name: 'Design', description: 'Creating visually or functionally', attributeKey: 'CREATIVITY' },
  { name: 'Writing', description: 'Expressing ideas through words', attributeKey: 'CREATIVITY' },
  { name: 'Art', description: 'Visual or physical creative expression', attributeKey: 'CREATIVITY' },
  { name: 'Music', description: 'Musical creativity and performance', attributeKey: 'CREATIVITY' },
  { name: 'Building', description: 'Turning ideas into real things', attributeKey: 'CREATIVITY' },
  { name: 'Experimentation', description: 'Trying new approaches', attributeKey: 'CREATIVITY' },

  // Wisdom
  { name: 'Self-Awareness', description: 'Understanding yourself', attributeKey: 'WISDOM' },
  { name: 'Decision Making', description: 'Choosing effectively', attributeKey: 'WISDOM' },
  { name: 'Emotional Intelligence', description: 'Understanding and managing emotions', attributeKey: 'WISDOM' },
  { name: 'Perspective', description: 'Seeing the bigger picture', attributeKey: 'WISDOM' },
  { name: 'Experience', description: 'Learning from what happens to you', attributeKey: 'WISDOM' },
  { name: 'Judgement', description: 'Recognising good and bad choices', attributeKey: 'WISDOM' },
  { name: 'Patience', description: 'Avoiding impulsive decisions', attributeKey: 'WISDOM' },
  { name: 'Adaptability', description: 'Adjusting when circumstances change', attributeKey: 'WISDOM' },
  { name: 'Reflection', description: 'Learning from past experiences', attributeKey: 'WISDOM' },
  { name: 'Values', description: 'Understanding what matters to you', attributeKey: 'WISDOM' },
];
