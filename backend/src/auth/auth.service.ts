import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { toPublicUser } from '../common/serializers/public-user';
import { AttributesService } from '../attributes/attributes.service';

const SALT_ROUNDS = 10;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly attributesService: AttributesService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email is already registered' : 'Username is already taken',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, username: dto.username, passwordHash },
      });
      await this.attributesService.ensureDefaultAttributes(created.id, tx);
      return created;
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid email or password');

    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    const jwtConfig = this.configService.get('jwt', { infer: true });

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: jwtConfig.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.hashedRefreshToken) throw new UnauthorizedException('Invalid refresh token');

    const matches = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!matches) throw new UnauthorizedException('Invalid refresh token');

    return this.issueSession(user);
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { hashedRefreshToken: null } });
  }

  private async issueSession(user: User) {
    const tokens = await this.generateTokenPair(user);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { hashedRefreshToken } });

    return { user: toPublicUser(user), ...tokens };
  }

  private async generateTokenPair(user: User): Promise<TokenPair> {
    const jwtConfig = this.configService.get('jwt', { infer: true });
    const basePayload = { sub: user.id, email: user.email, username: user.username };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(basePayload, {
        secret: jwtConfig.accessSecret,
        expiresIn: jwtConfig.accessExpiresIn,
      }),
      this.jwtService.signAsync({ sub: user.id }, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiresIn,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
