import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import type { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private clientContext(req: Request) {
    const ip =
      req.ip ||
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      undefined;
    const deviceName =
      typeof req.headers['x-device-name'] === 'string'
        ? req.headers['x-device-name']
        : undefined;
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined;
    return {
      userAgent,
      ipAddress: ip,
      deviceName,
    };
  }

  @Post('signup')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  signup(@Body() body: SignupDto, @Req() req: Request) {
    return this.authService.signup(body, this.clientContext(req));
  }

  @Post('login')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.authService.login(body, this.clientContext(req));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(body.refreshToken, this.clientContext(req));
  }

  @Post('logout')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, body);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user.userId);
  }
}
