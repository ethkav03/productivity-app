import { PrismaService } from '../prisma/prisma.service';

const NEGLECT_WINDOW_DAYS = 7;

export interface NeglectedAttributeResult {
  attributeId: string;
  attributeKey: string;
  attributeName: string;
  /** Total XP earned in this attribute over the trailing NEGLECT_WINDOW_DAYS window. */
  windowXp: number;
  /** One of the user's own skills under this attribute, if any exist. */
  skill: { id: string; name: string } | null;
}

/**
 * Finds the user's most-neglected attribute - the one with the lowest XP
 * earned in the trailing 7 days (an attribute with zero rows in the window
 * counts as most neglected). Shared by Quest Board's auto-generated System
 * quests and Daily/Weekly Challenges, so "what's been neglected" means the
 * same thing in both places rather than two separate heuristics drifting
 * apart.
 *
 * `requireSkill: true` skips candidates with no skill under them at all,
 * since "complete an activity tagged with this attribute's skill" is
 * meaningless without one to tag - falls through to the next-most-neglected
 * attribute that does have a skill. Returns null only if the user has no
 * attributes (shouldn't happen - all 8 are seeded at registration) or, with
 * requireSkill, no skills anywhere.
 */
export async function findNeglectedAttribute(
  prisma: PrismaService,
  userId: string,
  options: { requireSkill?: boolean } = {},
): Promise<NeglectedAttributeResult | null> {
  const windowStart = new Date(Date.now() - NEGLECT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [attributes, windowTotals, skills] = await Promise.all([
    prisma.attribute.findMany({ where: { userId } }),
    prisma.xPTransaction.groupBy({
      by: ['attributeId'],
      where: { userId, attributeId: { not: null }, createdAt: { gte: windowStart } },
      _sum: { amount: true },
    }),
    prisma.skill.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);

  if (attributes.length === 0) return null;

  const xpByAttribute = new Map(windowTotals.map((row) => [row.attributeId as string, row._sum.amount ?? 0]));
  const skillsByAttribute = new Map<string, { id: string; name: string }>();
  for (const skill of skills) {
    if (!skillsByAttribute.has(skill.attributeId)) {
      skillsByAttribute.set(skill.attributeId, { id: skill.id, name: skill.name });
    }
  }

  const ranked = attributes
    .map((attribute) => ({
      attribute,
      windowXp: xpByAttribute.get(attribute.id) ?? 0,
      skill: skillsByAttribute.get(attribute.id) ?? null,
    }))
    .sort((a, b) => a.windowXp - b.windowXp);

  const candidate = options.requireSkill ? ranked.find((entry) => entry.skill !== null) : ranked[0];
  if (!candidate) return null;

  return {
    attributeId: candidate.attribute.id,
    attributeKey: candidate.attribute.key,
    attributeName: candidate.attribute.name,
    windowXp: candidate.windowXp,
    skill: candidate.skill,
  };
}
