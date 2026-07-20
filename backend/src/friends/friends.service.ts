import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Friendship, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FriendProfile, toFriendProfile } from '../common/serializers/public-user';

type FriendshipWithUsers = Friendship & { requester: User; addressee: User };

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(userId: string, username: string) {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) {
      throw new NotFoundException('No user found with that username');
    }
    if (target.id === userId) {
      throw new BadRequestException('You cannot send a friend request to yourself');
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new ConflictException('You are already friends with this user');
      }
      throw new ConflictException(
        existing.requesterId === userId
          ? 'You already sent this user a friend request'
          : 'This user already sent you a friend request - accept it instead',
      );
    }

    const friendship = await this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: target.id },
      include: { requester: true, addressee: true },
    });
    return this.serializeRequest(friendship, userId);
  }

  async listRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'PENDING', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: true, addressee: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeRequest(row, userId));
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.getFriendshipOrThrow(friendshipId);
    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('Only the recipient of a friend request can accept it');
    }
    if (friendship.status !== 'PENDING') {
      throw new BadRequestException('This friend request is no longer pending');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
      include: { requester: true, addressee: true },
    });
    return this.serializeRequest(updated, userId);
  }

  /** Declines an incoming request, cancels an outgoing one, or removes an accepted friendship - all are just "delete a row I'm party to". */
  async removeFriendship(userId: string, friendshipId: string) {
    const friendship = await this.getFriendshipOrThrow(friendshipId);
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw new ForbiddenException('You are not part of this friendship');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { id: friendshipId };
  }

  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: true, addressee: true },
      orderBy: { respondedAt: 'desc' },
    });
    return rows.map((row) => {
      const other = row.requesterId === userId ? row.addressee : row.requester;
      return {
        friendshipId: row.id,
        friendSince: row.respondedAt,
        ...toFriendProfile(other),
      };
    });
  }

  /**
   * Candidates for a "Suggested Friends" list: other users with no existing
   * Friendship row against the caller (any status, either direction), so
   * suggestions never overlap with someone already friended, requested, or
   * pending. Ranked by totalXP as a simple "notable characters" proxy, since
   * there is no mutual-friends/social graph to rank by.
   */
  async getSuggestions(userId: string, limit: number): Promise<FriendProfile[]> {
    const existingRelations = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });

    const excludedIds = new Set<string>([userId]);
    for (const relation of existingRelations) {
      excludedIds.add(relation.requesterId);
      excludedIds.add(relation.addresseeId);
    }

    const candidates = await this.prisma.user.findMany({
      where: { id: { notIn: Array.from(excludedIds) } },
      orderBy: [{ totalXP: 'desc' }, { username: 'asc' }],
      take: limit,
    });

    return candidates.map((candidate) => toFriendProfile(candidate));
  }

  /** The comparison group for the leaderboard: every user this account has an ACCEPTED friendship with, in either direction. */
  async getFriendUserIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
  }

  private async getFriendshipOrThrow(id: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id } });
    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }
    return friendship;
  }

  private serializeRequest(friendship: FriendshipWithUsers, viewerId: string) {
    const isRequester = friendship.requesterId === viewerId;
    const other = isRequester ? friendship.addressee : friendship.requester;
    return {
      id: friendship.id,
      status: friendship.status,
      direction: isRequester ? ('OUTGOING' as const) : ('INCOMING' as const),
      createdAt: friendship.createdAt,
      user: toFriendProfile(other),
    };
  }
}
