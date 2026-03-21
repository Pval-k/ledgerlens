import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  @Post('login')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }
}
