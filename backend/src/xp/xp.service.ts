import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { AttributeXpResult, AwardXpParams, LevelChangeResult, SkillXpResult, XpAwardResult } from './xp.types';

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
    const { userId, amount, sourceType, sourceId, skillIds = [], note } = params;
    if (amount <= 0) {
      throw new BadRequestException('XP amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.xPTransaction.create({
        data: { userId, amount, sourceType, sourceId, note },
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
      const uniqueSkillIds = Array.from(new Set(skillIds));

      for (const skillId of uniqueSkillIds) {
        await tx.xPTransaction.create({
          data: { userId, skillId, amount, sourceType, sourceId, note },
        });

        const skill = await tx.skill.findUniqueOrThrow({ where: { id: skillId } });
        const previousSkillState = calculateLevelState(skill.totalXP);
        const newSkillTotalXp = skill.totalXP + amount;
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

        // Every skill's XP also flows up to the attribute it belongs to.
        // Deliberately not deduplicated across skills sharing an attribute -
        // same rationale as skills each getting the full XP amount.
        await tx.xPTransaction.create({
          data: { userId, attributeId: skill.attributeId, amount, sourceType, sourceId, note },
        });

        const attribute = await tx.attribute.findUniqueOrThrow({ where: { id: skill.attributeId } });
        const previousAttributeState = calculateLevelState(attribute.totalXP);
        const newAttributeTotalXp = attribute.totalXP + amount;
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

      return { xpGained: amount, character, skills, attributes };
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
