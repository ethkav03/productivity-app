import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import {
  ApplyCorrectionParams,
  AttributeXpResult,
  AwardXpParams,
  CorrectionResult,
  LevelChangeResult,
  SkillXpResult,
  XpAwardResult,
} from './xp.types';

/**
 * Centralised XP ledger. Every source of XP in the app (quests, habits,
 * goals, achievement bonuses, manual corrections) must flow through
 * `awardXp` rather than mutating `user.totalXP` / `skill.totalXP` directly,
 * so that XP is always backed by an immutable transaction record.
 */
@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  async awardXp(params: AwardXpParams): Promise<XpAwardResult> {
    const { userId, amount, sourceType, sourceId, sourceName, skillAwards = [], attributeBonuses = [], note } = params;
    if (amount <= 0) {
      throw new BadRequestException('XP amount must be positive');
    }
    if (skillAwards.some((award) => award.amount !== undefined && award.amount <= 0)) {
      throw new BadRequestException('Skill XP override amounts must be positive');
    }
    if (attributeBonuses.some((bonus) => bonus.amount <= 0)) {
      throw new BadRequestException('Attribute bonus amounts must be positive');
    }
    const eventId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await tx.xPTransaction.create({
        data: { userId, amount, sourceType, sourceId, sourceName, eventId, note },
      });

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const previousLevelState = calculateLevelState(user.totalXP);
      const newTotalXp = user.totalXP + amount;
      const newLevelState = calculateLevelState(newTotalXp);

      await tx.user.update({
        where: { id: userId },
        data: { totalXP: newTotalXp, level: newLevelState.level },
      });

      const character: LevelChangeResult = {
        previousLevel: previousLevelState.level,
        newLevel: newLevelState.level,
        leveledUp: newLevelState.level > previousLevelState.level,
      };

      const skills: SkillXpResult[] = [];
      const attributes: AttributeXpResult[] = [];

      // Dedupe by skillId - if the same skill somehow appears twice, the
      // first occurrence's amount (override or not) wins, matching the
      // pre-XP-Bundles dedupe behavior for plain skillIds.
      const seenSkillIds = new Set<string>();
      const uniqueSkillAwards = skillAwards.filter((award) => {
        if (seenSkillIds.has(award.skillId)) return false;
        seenSkillIds.add(award.skillId);
        return true;
      });

      for (const skillAward of uniqueSkillAwards) {
        const skillId = skillAward.skillId;
        // "XP Bundles": a skill can override the character-level amount
        // (e.g. a gym session gives the character +100 but only +150 to a
        // specifically-emphasized skill) - undefined just inherits `amount`,
        // the pre-Bundles default.
        const skillAmount = skillAward.amount ?? amount;

        await tx.xPTransaction.create({
          data: { userId, skillId, amount: skillAmount, sourceType, sourceId, sourceName, eventId, note },
        });

        const skill = await tx.skill.findUniqueOrThrow({ where: { id: skillId } });
        const previousSkillState = calculateLevelState(skill.totalXP);
        const newSkillTotalXp = skill.totalXP + skillAmount;
        const newSkillState = calculateLevelState(newSkillTotalXp);

        await tx.skill.update({
          where: { id: skillId },
          data: { totalXP: newSkillTotalXp, level: newSkillState.level },
        });

        skills.push({
          skillId,
          previousLevel: previousSkillState.level,
          newLevel: newSkillState.level,
          leveledUp: newSkillState.level > previousSkillState.level,
        });

        // Every skill's XP also flows up to the attribute it belongs to,
        // using that skill's own (possibly overridden) amount. Deliberately
        // not deduplicated across skills sharing an attribute - same
        // rationale as skills each getting their own full amount.
        await tx.xPTransaction.create({
          data: { userId, attributeId: skill.attributeId, amount: skillAmount, sourceType, sourceId, sourceName, eventId, note },
        });

        const attribute = await tx.attribute.findUniqueOrThrow({ where: { id: skill.attributeId } });
        const previousAttributeState = calculateLevelState(attribute.totalXP);
        const newAttributeTotalXp = attribute.totalXP + skillAmount;
        const newAttributeState = calculateLevelState(newAttributeTotalXp);

        await tx.attribute.update({
          where: { id: skill.attributeId },
          data: { totalXP: newAttributeTotalXp, level: newAttributeState.level },
        });

        attributes.push({
          attributeId: skill.attributeId,
          previousLevel: previousAttributeState.level,
          newLevel: newAttributeState.level,
          leveledUp: newAttributeState.level > previousAttributeState.level,
        });
      }

      // "XP Bundles": bonus XP to an attribute with no tagged skill at all
      // (e.g. a workout quest also crediting Discipline for showing up).
      const seenAttributeIds = new Set<string>();
      const uniqueAttributeBonuses = attributeBonuses.filter((bonus) => {
        if (seenAttributeIds.has(bonus.attributeId)) return false;
        seenAttributeIds.add(bonus.attributeId);
        return true;
      });

      for (const bonus of uniqueAttributeBonuses) {
        await tx.xPTransaction.create({
          data: {
            userId,
            attributeId: bonus.attributeId,
            amount: bonus.amount,
            sourceType,
            sourceId,
            sourceName,
            eventId,
            note,
          },
        });

        const attribute = await tx.attribute.findUniqueOrThrow({ where: { id: bonus.attributeId } });
        const previousAttributeState = calculateLevelState(attribute.totalXP);
        const newAttributeTotalXp = attribute.totalXP + bonus.amount;
        const newAttributeState = calculateLevelState(newAttributeTotalXp);

        await tx.attribute.update({
          where: { id: bonus.attributeId },
          data: { totalXP: newAttributeTotalXp, level: newAttributeState.level },
        });

        attributes.push({
          attributeId: bonus.attributeId,
          previousLevel: previousAttributeState.level,
          newLevel: newAttributeState.level,
          leveledUp: newAttributeState.level > previousAttributeState.level,
        });
      }

      return { xpGained: amount, character, skills, attributes, eventId };
    });
  }

  /**
   * A direct, out-of-band ledger correction - the only place `amount` may be
   * negative (per the `XPTransaction.amount` field comment in the schema).
   * Unlike `awardXp`, this never cascades: it touches exactly one of the
   * character or a single named attribute, never both and never any skills,
   * since a correction isn't tied to completing anything. Used by the admin
   * dashboard to directly adjust a user's level.
   */
  async applyCorrection(params: ApplyCorrectionParams): Promise<CorrectionResult> {
    const { userId, amount, note, sourceName, attributeId } = params;
    if (amount === 0) {
      throw new BadRequestException('Correction amount must not be zero');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.xPTransaction.create({
        data: {
          userId,
          amount,
          sourceType: 'CORRECTION',
          sourceName,
          eventId: randomUUID(),
          note: note ?? 'Admin correction',
          attributeId: attributeId ?? null,
        },
      });

      if (attributeId) {
        const attribute = await tx.attribute.findUniqueOrThrow({ where: { id: attributeId } });
        const previousState = calculateLevelState(attribute.totalXP);
        const newTotalXp = Math.max(0, attribute.totalXP + amount);
        const newState = calculateLevelState(newTotalXp);

        await tx.attribute.update({
          where: { id: attributeId },
          data: { totalXP: newTotalXp, level: newState.level },
        });

        return {
          scope: 'ATTRIBUTE',
          attributeId,
          previousLevel: previousState.level,
          newLevel: newState.level,
          leveledUp: newState.level > previousState.level,
          totalXP: newTotalXp,
        };
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const previousState = calculateLevelState(user.totalXP);
      const newTotalXp = Math.max(0, user.totalXP + amount);
      const newState = calculateLevelState(newTotalXp);

      await tx.user.update({
        where: { id: userId },
        data: { totalXP: newTotalXp, level: newState.level },
      });

      return {
        scope: 'CHARACTER',
        previousLevel: previousState.level,
        newLevel: newState.level,
        leveledUp: newState.level > previousState.level,
        totalXP: newTotalXp,
      };
    });
  }

  async getRecentActivity(userId: string, limit = 20) {
    return this.prisma.xPTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { skill: { select: { id: true, name: true } } },
    });
  }
}
