import { Controller, Get, UseGuards } from '@nestjs/common';

import { Role } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface CompetitorIntelSummary {
  id: string;
  competitorName: string;
  pricingModel: string | null;
  technicalStrategies: string | null;
  winThemes: string | null;
  sourceDocumentId: string | null;
  updatedAt: string;
}

/**
 * Read-only list of competitor intel rows for the tenant (master-prompt
 * Core Module 5 — Competitive Intelligence viewer).
 */
@Controller('api/competitors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER, Role.READ_ONLY)
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ competitors: CompetitorIntelSummary[] }> {
    const rows = await this.prisma.competitorIntel.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      competitors: rows.map((r) => ({
        id: r.id,
        competitorName: r.competitorName,
        pricingModel: r.pricingModel,
        technicalStrategies: r.technicalStrategies,
        winThemes: r.winThemes,
        sourceDocumentId: r.sourceDocumentId,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }
}
