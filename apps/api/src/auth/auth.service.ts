import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import type { JwtPayload } from './types/jwt-payload.type';

const BCRYPT_ROUNDS = 10;
const REFRESH_TTL_MS =
  parseInt(process.env.REFRESH_TOKEN_TTL_MS ?? '', 10) ||
  30 * 24 * 60 * 60 * 1000;

type AuthClientContext = {
  userAgent?: string;
  ipAddress?: string;
  deviceName?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto, ctx: AuthClientContext) {
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Passwords do not match');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
      },
      select: { id: true, email: true, name: true },
    });

    return this.issueTokensForUser(
      { id: user.id, email: user.email, name: user.name },
      ctx,
    );
  }

  /** Current user from DB (JWT only proves identity; this refreshes profile). */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { user };
  }

  async login(dto: LoginDto, ctx: AuthClientContext) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokensForUser(
      { id: user.id, email: user.email, name: user.name },
      ctx,
    );
  }

  async refresh(refreshToken: string, ctx: AuthClientContext) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existing = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const nextRefreshToken = this.generateRefreshToken();
    const nextRefreshHash = this.hashRefreshToken(nextRefreshToken);
    const nextExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    const rotated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshSession.create({
        data: {
          userId: existing.userId,
          tokenHash: nextRefreshHash,
          userAgent: ctx.userAgent,
          ipAddress: ctx.ipAddress,
          deviceName: ctx.deviceName ?? existing.deviceName,
          expiresAt: nextExpiresAt,
        },
        select: {
          id: true,
          expiresAt: true,
          deviceName: true,
        },
      });

      await tx.refreshSession.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedBySessionId: next.id,
        },
      });

      return next;
    });

    const accessToken = await this.signAccessToken(
      existing.user.id,
      existing.user.email,
    );
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      user: existing.user,
      session: rotated,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.newPasswordConfirm) {
      throw new BadRequestException('New passwords do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const match = await bcrypt.compare(dto.currentPassword, user.hashedPassword);
    if (!match) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedPassword },
    });
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { ok: true as const };
  }

  private async issueTokensForUser(
    user: { id: string; email: string; name: string },
    ctx: AuthClientContext,
  ) {
    const accessToken = await this.signAccessToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const session = await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        deviceName: ctx.deviceName,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
        deviceName: true,
      },
    });

    return {
      accessToken,
      refreshToken,
      user,
      session,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    const pepper =
      process.env.REFRESH_TOKEN_PEPPER ??
      process.env.JWT_SECRET ??
      'dev-refresh-token-pepper-change-me';
    return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
  }

  private signAccessToken(userId: string, email: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwtService.signAsync(payload);
  }
}
