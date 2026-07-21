/**
 * "Skill Trees" (Sprint 5, Feature 10) - a purely cosmetic tier label derived
 * from a skill's level, computed client-side (no backend change). The
 * roadmap's "concrete unlocks per tier" half is deliberately not built - see
 * docs/feature-roadmap.md's Feature 10 deviation note for why.
 */
const TIERS: Array<{ minLevel: number; name: string }> = [
  { minLevel: 35, name: 'Master' },
  { minLevel: 20, name: 'Advanced' },
  { minLevel: 10, name: 'Intermediate' },
  { minLevel: 5, name: 'Novice' },
  { minLevel: 1, name: 'Beginner' },
];

export function getSkillTier(level: number): string {
  return TIERS.find((tier) => level >= tier.minLevel)?.name ?? 'Beginner';
}
