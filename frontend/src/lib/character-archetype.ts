import { AttributeKey } from './types';

export interface ArchetypeResult {
  name: string;
  description: string;
  topAttributes: AttributeKey[];
}

/**
 * "Character Build System" (Sprint 5, Feature 9) - a read-only classification derived from the
 * user's current top 2 attribute levels, recomputed on every view (never stored), matching the
 * roadmap's own requirement that a build "never permanently locks the user." Only a curated
 * subset of the 28 possible attribute pairs is named; everything else falls back to "Explorer" -
 * see docs/feature-roadmap.md's Feature 9 deviation note for the full reasoning.
 */
const ARCHETYPES: Array<{ pair: [AttributeKey, AttributeKey]; name: string; description: string }> = [
  { pair: ['PHYSICAL', 'DISCIPLINE'], name: 'Warrior', description: 'Strength forged through consistency.' },
  { pair: ['PHYSICAL', 'ENERGY'], name: 'Athlete', description: 'Built for motion and endurance.' },
  { pair: ['INTELLIGENCE', 'WISDOM'], name: 'Scholar', description: 'Driven by understanding.' },
  { pair: ['INTELLIGENCE', 'CREATIVITY'], name: 'Creator', description: 'Turning ideas into things.' },
  { pair: ['WEALTH', 'DISCIPLINE'], name: 'Entrepreneur', description: 'Building something that lasts.' },
  { pair: ['SOCIAL', 'CREATIVITY'], name: 'Socialite', description: 'Thrives on connection and expression.' },
];

export function computeArchetype(attributes: Array<{ key: AttributeKey; level: number }>): ArchetypeResult {
  const sorted = [...attributes].sort((a, b) => b.level - a.level);
  const [first, second] = sorted;

  if (!first || !second) {
    return { name: 'Explorer', description: 'Just getting started.', topAttributes: sorted.map((a) => a.key) };
  }

  if (first.level - second.level <= 1) {
    return {
      name: 'Balanced',
      description: 'A well-rounded build - no single trait dominates yet.',
      topAttributes: [first.key, second.key],
    };
  }

  const match = ARCHETYPES.find(
    (a) => (a.pair[0] === first.key && a.pair[1] === second.key) || (a.pair[0] === second.key && a.pair[1] === first.key),
  );
  if (match) {
    return { name: match.name, description: match.description, topAttributes: [first.key, second.key] };
  }

  return {
    name: 'Explorer',
    description: 'Forging a unique path.',
    topAttributes: [first.key, second.key],
  };
}
