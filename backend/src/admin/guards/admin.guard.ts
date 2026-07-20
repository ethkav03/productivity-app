import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Must run after JwtAuthGuard (which populates `request.user`). Looks the
 * user's `isAdmin` flag up fresh from the DB rather than trusting a JWT claim,
 * so revoking admin access takes effect immediately rather than waiting for
 * the token to expire.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authUser = request.user as AuthenticatedUser | undefined;
    if (!authUser) {
      throw new ForbiddenException('Admin access required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
