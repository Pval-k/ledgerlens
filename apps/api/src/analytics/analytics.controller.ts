import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Materialized monthly rollups (UTC month buckets), filterable and paginated. */
  @Get('documents/:id/analytics/monthly')
  async listMonthly(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.analyticsService.listMonthly(id, { from, to, page, limit });
  }

  /** Per-category slices within months; optional `category` (empty = uncategorized only). */
  @Get('documents/:id/analytics/by-category')
  async listByCategory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.analyticsService.listByCategory(id, {
      from,
      to,
      page,
      limit,
      category,
    });
  }
}
