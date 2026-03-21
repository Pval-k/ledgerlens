import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import type { JwtPayload } from './types/jwt-payload.type';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
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
        email,
        hashedPassword,
      },
      select: { id: true, email: true },
    });

    const accessToken = await this.signAccessToken(user.id, user.email);
    return {
      accessToken,
      user: { id: user.id, email: user.email },
    };
  }

  /** Current user from DB (JWT only proves identity; this refreshes profile). */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { user };
  }

  async login(dto: LoginDto) {
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

    const accessToken = await this.signAccessToken(user.id, user.email);
    return {
      accessToken,
      user: { id: user.id, email: user.email },
    };
  }

  private signAccessToken(userId: string, email: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwtService.signAsync(payload);
  }
}
