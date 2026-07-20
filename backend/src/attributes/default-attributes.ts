import { AttributeKey } from '@prisma/client';

export interface DefaultAttributeDefinition {
  key: AttributeKey;
  name: string;
  description: string;
  icon: string;
}

/**
 * The 8 fixed top-level attributes. Every user gets all 8 auto-created at
 * registration (see AttributesService.ensureDefaultAttributes) - unlike
 * skills, these are not opt-in.
 */
export const DEFAULT_ATTRIBUTES: DefaultAttributeDefinition[] = [
  { key: 'PHYSICAL', name: 'Physical', description: 'Your physical capability, health and body.', icon: 'dumbbell' },
  { key: 'INTELLIGENCE', name: 'Intelligence', description: 'Your ability to acquire, understand and use information.', icon: 'brain' },
  { key: 'DISCIPLINE', name: 'Discipline', description: 'Your ability to consistently act according to your goals.', icon: 'shield' },
  { key: 'ENERGY', name: 'Energy', description: 'Your available physical and mental resources.', icon: 'zap' },
  { key: 'SOCIAL', name: 'Social', description: 'Your ability to interact with, understand and build relationships with people.', icon: 'users' },
  { key: 'WEALTH', name: 'Wealth', description: 'Your financial resources, knowledge and independence.', icon: 'wallet' },
  { key: 'CREATIVITY', name: 'Creativity', description: 'Your ability to generate, develop and express ideas.', icon: 'palette' },
  { key: 'WISDOM', name: 'Wisdom', description: 'Your ability to make good decisions and understand yourself and the world.', icon: 'compass' },
];

/**
 * The fixed display order for the 8 attributes, matching DEFAULT_ATTRIBUTES.
 * Any endpoint returning multiple attributes should sort by this rather than
 * relying on database row order, which Postgres does not guarantee absent an
 * explicit ORDER BY.
 */
export const ATTRIBUTE_KEY_ORDER: AttributeKey[] = DEFAULT_ATTRIBUTES.map((attribute) => attribute.key);
