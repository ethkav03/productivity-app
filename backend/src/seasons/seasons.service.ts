import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributeKey, Season, SeasonStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

type AttributeLevelMap = Partial<Record<AttributeKey, number>>;

@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  private async currentAttributeState(userId: string): Promise<{ level: number; attributeLevels: AttributeLevelMap }> {
    const [user, attributes] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.attribute.findMany({ where: { userId } }),
    ]);
    const attributeLevels: AttributeLevelMap = Object.fromEntries(attributes.map((a) => [a.key, a.level]));
    return { level: user.level, attributeLevels };
  }

  /**
   * A COMPLETED season's deltas are frozen from its stored end snapshot; an
   * ACTIVE season's deltas are computed live against the user's *current*
   * level/attribute state (passed in as `current`), so "what have I done
   * this season so far" is always fresh without needing a scheduled job to
   * keep it in sync.
   */
  private serialize(season: Season, current?: { level: number; attributeLevels: AttributeLevelMap }) {
    const isActive = season.status === 'ACTIVE';
    const endLevel = isActive ? current!.level : (season.endLevel as number);
    const endAttributeLevels = isActive ? current!.attributeLevels : (season.endAttributeLevels as AttributeLevelMap);
    const startAttributeLevels = season.startAttributeLevels as AttributeLevelMap;

    const attributeDeltas = season.focus.map((key) => {
      const startLevel = startAttributeLevels[key] ?? 1;
      const currentLevel = endAttributeLevels[key] ?? 1;
      return { key, startLevel, currentLevel, delta: currentLevel - startLevel };
    });

    return {
      ...season,
      currentLevel: endLevel,
      levelDelta: endLevel - season.startLevel,
      attributeDeltas,
    };
  }

  async findAll(userId: string, filters: { status?: SeasonStatus }) {
    const seasons = await this.prisma.season.findMany({
      where: { userId, ...(filters.status && { status: filters.status }) },
      orderBy: { startDate: 'desc' },
    });
    const current = seasons.some((s) => s.status === 'ACTIVE') ? await this.currentAttributeState(userId) : undefined;
    return seasons.map((season) => this.serialize(season, current));
  }

  async findOne(userId: string, id: string) {
    const season = await this.getOwnedSeason(userId, id);
    const goals = await this.prisma.goal.findMany({ where: { seasonId: id }, orderBy: { createdAt: 'desc' } });
    const current = season.status === 'ACTIVE' ? await this.currentAttributeState(userId) : undefined;
    return { ...this.serialize(season, current), goals };
  }

  /**
   * "Seasons and Chapters" (Sprint 5): starting a new season auto-closes
   * whichever one is currently ACTIVE first (capturing its own closing
   * snapshot) - at most one ACTIVE season per user at a time, enforced here
   * rather than a DB constraint, matching how "one pending reward" and
   * similar single-active-thing invariants are enforced elsewhere in this
   * codebase (application-level, not schema-level).
   */
  async create(userId: string, dto: CreateSeasonDto) {
    const active = await this.prisma.season.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (active) {
      await this.closeSeason(userId, active.id);
    }

    const { level, attributeLevels } = await this.currentAttributeState(userId);
    const season = await this.prisma.season.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        focus: dto.focus,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        startLevel: level,
        startAttributeLevels: attributeLevels,
      },
    });
    return this.serialize(season, { level, attributeLevels });
  }

  async update(userId: string, id: string, dto: UpdateSeasonDto) {
    await this.getOwnedSeason(userId, id);
    const season = await this.prisma.season.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.focus !== undefined && { focus: dto.focus }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
      },
    });
    const current = season.status === 'ACTIVE' ? await this.currentAttributeState(userId) : undefined;
    return this.serialize(season, current);
  }

  async close(userId: string, id: string) {
    const season = await this.getOwnedSeason(userId, id);
    if (season.status !== 'ACTIVE') {
      throw new BadRequestException('Season is not active');
    }
    return this.closeSeason(userId, id);
  }

  private async closeSeason(userId: string, id: string) {
    const { level, attributeLevels } = await this.currentAttributeState(userId);
    const season = await this.prisma.season.update({
      where: { id },
      data: { status: 'COMPLETED', closedAt: new Date(), endLevel: level, endAttributeLevels: attributeLevels },
    });
    return this.serialize(season);
  }

  async remove(userId: string, id: string) {
    await this.getOwnedSeason(userId, id);
    await this.prisma.season.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async getOwnedSeason(userId: string, id: string) {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('Season not found');
    if (season.userId !== userId) throw new ForbiddenException();
    return season;
  }
}
