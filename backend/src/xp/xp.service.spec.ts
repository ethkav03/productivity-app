import { BadRequestException } from '@nestjs/common';
import { XpService } from './xp.service';

/**
 * Builds a fake `tx` (the object passed into `prisma.$transaction(async (tx) => ...)`)
 * with jest mocks for every model method XpService touches, plus sensible
 * default return values that can be overridden per test.
 */
function createMockTx(overrides: {
  user?: Partial<{ totalXP: number }>;
  skill?: Partial<{ totalXP: number; attributeId: string }>;
  attribute?: Partial<{ totalXP: number }>;
} = {}) {
  return {
    xPTransaction: { create: jest.fn() },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ totalXP: overrides.user?.totalXP ?? 0 }),
      update: jest.fn(),
    },
    skill: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        totalXP: overrides.skill?.totalXP ?? 0,
        attributeId: overrides.skill?.attributeId ?? 'attr-1',
      }),
      update: jest.fn(),
    },
    attribute: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ totalXP: overrides.attribute?.totalXP ?? 0 }),
      update: jest.fn(),
    },
  };
}

function createService(tx: ReturnType<typeof createMockTx>) {
  const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  return { service: new XpService(prisma as never), prisma };
}

describe('XpService.awardXp', () => {
  it('rejects a non-positive amount', async () => {
    const { service } = createService(createMockTx());
    await expect(
      service.awardXp({ userId: 'u1', amount: 0, sourceType: 'QUEST_COMPLETION' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.awardXp({ userId: 'u1', amount: -10, sourceType: 'QUEST_COMPLETION' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes exactly one character-level row, with neither skillId nor attributeId set, when no skills are tagged', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.awardXp({ userId: 'u1', amount: 50, sourceType: 'QUEST_COMPLETION', sourceId: 'q1', sourceName: 'Morning Run' });

    expect(tx.xPTransaction.create).toHaveBeenCalledTimes(1);
    const row = tx.xPTransaction.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: 'u1', amount: 50, sourceType: 'QUEST_COMPLETION', sourceId: 'q1', sourceName: 'Morning Run' });
    expect(row.skillId).toBeUndefined();
    expect(row.attributeId).toBeUndefined();
  });

  it('never combines skillId and attributeId on the same row - one row per level of the cascade', async () => {
    const tx = createMockTx({ skill: { attributeId: 'attr-strength' } });
    const { service } = createService(tx);

    await service.awardXp({ userId: 'u1', amount: 100, sourceType: 'QUEST_COMPLETION', skillAwards: [{ skillId: 'skill-strength' }] });

    expect(tx.xPTransaction.create).toHaveBeenCalledTimes(3);
    const rows = tx.xPTransaction.create.mock.calls.map((call) => call[0].data);

    const characterRow = rows.find((r) => !r.skillId && !r.attributeId);
    const skillRow = rows.find((r) => r.skillId);
    const attributeRow = rows.find((r) => r.attributeId);

    expect(characterRow).toBeDefined();
    expect(skillRow).toMatchObject({ skillId: 'skill-strength', amount: 100 });
    expect(skillRow.attributeId).toBeUndefined();
    expect(attributeRow).toMatchObject({ attributeId: 'attr-strength', amount: 100 });
    expect(attributeRow.skillId).toBeUndefined();

    // every associated skill gets the FULL amount, not a divided share
    expect(skillRow.amount).toBe(100);
    expect(attributeRow.amount).toBe(100);

    // all three rows correlate back to the same event, and it's a real id
    expect(characterRow.eventId).toBe(skillRow.eventId);
    expect(skillRow.eventId).toBe(attributeRow.eventId);
    expect(characterRow.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives two separate awardXp calls two different eventIds', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.awardXp({ userId: 'u1', amount: 10, sourceType: 'QUEST_COMPLETION' });
    await service.awardXp({ userId: 'u1', amount: 10, sourceType: 'QUEST_COMPLETION' });

    const [firstEventId, secondEventId] = tx.xPTransaction.create.mock.calls.map((call) => call[0].data.eventId);
    expect(firstEventId).not.toBe(secondEventId);
  });

  it('deduplicates repeated skill ids in the same award', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.awardXp({
      userId: 'u1',
      amount: 20,
      sourceType: 'HABIT_COMPLETION',
      skillAwards: [{ skillId: 'skill-1' }, { skillId: 'skill-1' }],
    });

    // 1 character row + 1 skill row + 1 attribute row, not 5
    expect(tx.xPTransaction.create).toHaveBeenCalledTimes(3);
  });

  it('XP Bundles: a per-skill override amount replaces the character amount for that skill and its attribute, not the character row', async () => {
    const tx = createMockTx({ skill: { attributeId: 'attr-physical' } });
    const { service } = createService(tx);

    await service.awardXp({
      userId: 'u1',
      amount: 100,
      sourceType: 'QUEST_COMPLETION',
      skillAwards: [{ skillId: 'skill-strength', amount: 250 }],
    });

    const rows = tx.xPTransaction.create.mock.calls.map((call) => call[0].data);
    const characterRow = rows.find((r) => !r.skillId && !r.attributeId);
    const skillRow = rows.find((r) => r.skillId);
    const attributeRow = rows.find((r) => r.attributeId);

    expect(characterRow.amount).toBe(100); // untouched - the override is skill-scoped only
    expect(skillRow.amount).toBe(250);
    expect(attributeRow.amount).toBe(250); // the skill's own amount cascades, not the character's
  });

  it('XP Bundles: an omitted per-skill amount falls back to the character amount (pre-Bundles behavior)', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.awardXp({
      userId: 'u1',
      amount: 60,
      sourceType: 'QUEST_COMPLETION',
      skillAwards: [{ skillId: 'skill-1' }], // no amount override
    });

    const rows = tx.xPTransaction.create.mock.calls.map((call) => call[0].data);
    const skillRow = rows.find((r) => r.skillId);
    expect(skillRow.amount).toBe(60);
  });

  it('XP Bundles: attribute bonuses credit an attribute directly, with no tagged skill and no effect on the character row', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    const result = await service.awardXp({
      userId: 'u1',
      amount: 100,
      sourceType: 'QUEST_COMPLETION',
      attributeBonuses: [{ attributeId: 'attr-discipline', amount: 50 }],
    });

    expect(tx.xPTransaction.create).toHaveBeenCalledTimes(2); // 1 character + 1 attribute bonus, no skill row
    const rows = tx.xPTransaction.create.mock.calls.map((call) => call[0].data);
    const characterRow = rows.find((r) => !r.skillId && !r.attributeId);
    const bonusRow = rows.find((r) => r.attributeId);

    expect(characterRow.amount).toBe(100);
    expect(bonusRow).toMatchObject({ attributeId: 'attr-discipline', amount: 50 });
    expect(bonusRow.skillId).toBeUndefined();
    expect(result.attributes).toEqual([
      expect.objectContaining({ attributeId: 'attr-discipline' }),
    ]);
  });

  it('XP Bundles: deduplicates repeated attribute bonuses in the same award', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.awardXp({
      userId: 'u1',
      amount: 10,
      sourceType: 'QUEST_COMPLETION',
      attributeBonuses: [
        { attributeId: 'attr-1', amount: 20 },
        { attributeId: 'attr-1', amount: 20 },
      ],
    });

    expect(tx.xPTransaction.create).toHaveBeenCalledTimes(2); // 1 character + 1 bonus, not 3
  });

  it('XP Bundles: rejects a non-positive per-skill override amount', async () => {
    const { service } = createService(createMockTx());
    await expect(
      service.awardXp({ userId: 'u1', amount: 50, sourceType: 'QUEST_COMPLETION', skillAwards: [{ skillId: 's1', amount: 0 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('XP Bundles: rejects a non-positive attribute bonus amount', async () => {
    const { service } = createService(createMockTx());
    await expect(
      service.awardXp({ userId: 'u1', amount: 50, sourceType: 'QUEST_COMPLETION', attributeBonuses: [{ attributeId: 'a1', amount: -5 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports a level-up when cumulative XP crosses a level boundary', async () => {
    const tx = createMockTx({ user: { totalXP: 80 } });
    const { service } = createService(tx);

    const result = await service.awardXp({ userId: 'u1', amount: 50, sourceType: 'QUEST_COMPLETION' });

    // 80 -> 130 total XP crosses the level-2 boundary at 100
    expect(result.character.previousLevel).toBe(1);
    expect(result.character.newLevel).toBe(2);
    expect(result.character.leveledUp).toBe(true);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { totalXP: 130, level: 2 } });
  });

  it('does not report a level-up when XP stays within the same level', async () => {
    const tx = createMockTx({ user: { totalXP: 10 } });
    const { service } = createService(tx);

    const result = await service.awardXp({ userId: 'u1', amount: 5, sourceType: 'QUEST_COMPLETION' });

    expect(result.character.leveledUp).toBe(false);
    expect(result.character.newLevel).toBe(1);
  });
});

describe('XpService.applyCorrection', () => {
  it('rejects a zero amount', async () => {
    const { service } = createService(createMockTx());
    await expect(service.applyCorrection({ userId: 'u1', amount: 0 })).rejects.toThrow(BadRequestException);
  });

  it('accepts a negative amount (the only path where this is allowed)', async () => {
    const tx = createMockTx({ user: { totalXP: 500 } });
    const { service } = createService(tx);

    const result = await service.applyCorrection({ userId: 'u1', amount: -200 });

    expect(result.scope).toBe('CHARACTER');
    expect(result.totalXP).toBe(300);
    const row = tx.xPTransaction.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: 'u1', amount: -200, sourceType: 'CORRECTION', attributeId: null });
  });

  it('clamps the resulting total to a minimum of 0 rather than going negative', async () => {
    const tx = createMockTx({ user: { totalXP: 50 } });
    const { service } = createService(tx);

    const result = await service.applyCorrection({ userId: 'u1', amount: -500 });

    expect(result.totalXP).toBe(0);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { totalXP: 0, level: 1 } });
  });

  it('defaults the note to "Admin correction" when none is given', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    await service.applyCorrection({ userId: 'u1', amount: 100 });

    expect(tx.xPTransaction.create.mock.calls[0][0].data.note).toBe('Admin correction');
  });

  it('targets exactly one attribute, and never the character, when attributeId is set', async () => {
    const tx = createMockTx({ attribute: { totalXP: 100 } });
    const { service } = createService(tx);

    const result = await service.applyCorrection({ userId: 'u1', amount: 50, attributeId: 'attr-1' });

    expect(result.scope).toBe('ATTRIBUTE');
    expect(result.attributeId).toBe('attr-1');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.attribute.update).toHaveBeenCalledWith({ where: { id: 'attr-1' }, data: { totalXP: 150, level: expect.any(Number) } });
    const row = tx.xPTransaction.create.mock.calls[0][0].data;
    expect(row.attributeId).toBe('attr-1');
  });
});
