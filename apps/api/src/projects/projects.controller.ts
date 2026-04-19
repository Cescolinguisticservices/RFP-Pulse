import { Controller, Get, UseGuards } from '@nestjs/common';

import { Role, WorkflowState } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectSummary {
  id: string;
  title: string;
  clientName: string | null;
  dueAt: string | null;
  questionCount: number;
  stateCounts: Record<WorkflowState, number>;
  updatedAt: string;
}

/** Tenant-scoped list of RFP projects for the manager dashboard (Step 5.26). */
@Controller('api/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER, Role.READ_ONLY)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ projects: ProjectSummary[] }> {
    const projects = await this.prisma.rFPProject.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
      include: {
        questions: {
          select: {
            id: true,
            answers: { select: { state: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    return {
      projects: projects.map((p) => {
        const stateCounts: Record<WorkflowState, number> = {
          DRAFTING: 0,
          IN_REVIEW: 0,
          PENDING_APPROVAL: 0,
          APPROVED: 0,
          REJECTED: 0,
        };
        for (const q of p.questions) {
          const state = q.answers[0]?.state ?? WorkflowState.DRAFTING;
          stateCounts[state] += 1;
        }
        return {
          id: p.id,
          title: p.title,
          clientName: p.clientName,
          dueAt: p.dueAt ? p.dueAt.toISOString() : null,
          questionCount: p.questions.length,
          stateCounts,
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
    };
  }
}
