import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AnalyticsService } from './analytics.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Placeholder route; scoped to the document owner. */
  @Get('documents/:id/insights')
  insights(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.analyticsService.insightsStub(id, user.userId);
  }

  /** Materialized monthly rollups (UTC month buckets), filterable and paginated. */
  @Get('documents/:id/analytics/monthly')
  async listMonthly(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.analyticsService.listMonthly(id, user.userId, {
      from,
      to,
      page,
      limit,
    });
  }

  /** Per-category slices within months; optional `category` (empty = uncategorized only). */
  @Get('documents/:id/analytics/by-category')
  async listByCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.analyticsService.listByCategory(id, user.userId, {
      from,
      to,
      page,
      limit,
      category,
    });
  }
}
