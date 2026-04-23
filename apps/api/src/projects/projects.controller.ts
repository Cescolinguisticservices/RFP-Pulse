import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  UseGuards,
} from '@nestjs/common';

import { Role, RFPStatus, WorkflowState } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectUserRef {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface ProjectSummary {
  id: string;
  title: string;
  clientName: string | null;
  dueAt: string | null;
  status: RFPStatus;
  createdBy: ProjectUserRef | null;
  assignee: ProjectUserRef | null;
  questionCount: number;
  stateCounts: Record<WorkflowState, number>;
  createdAt: string;
  updatedAt: string;
}

/** Tenant-scoped list + bulk management of RFP projects (Step 9 list screen). */
@Controller('api/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER, Role.READ_ONLY)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ projects: ProjectSummary[] }> {
    const projects = await this.prisma.rFPProject.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, email: true, name: true, role: true } },
        assignee: { select: { id: true, email: true, name: true, role: true } },
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
          status: p.status,
          createdBy: p.createdBy ?? null,
          assignee: p.assignee ?? null,
          questionCount: p.questions.length,
          stateCounts,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Bulk delete RFP projects by id. Cascades to questions/answers/documents
   * via the existing Prisma relations (`onDelete: Cascade` on children,
   * `SetNull` on `Document.projectId`).
   *
   * Restricted to ADMIN / RFP_MANAGER. Silently ignores ids that do not
   * belong to the caller's tenant so cross-tenant probes can't enumerate.
   */
  @Delete()
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { ids?: unknown },
  ): Promise<{ deleted: number }> {
    const ids = normalizeIdList(body.ids);
    if (ids.length === 0) return { deleted: 0 };
    const result = await this.prisma.rFPProject.deleteMany({
      where: { id: { in: ids }, tenantId: user.tenantId },
    });
    return { deleted: result.count };
  }
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('ids must be an array of project id strings');
  }
  const ids = value
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length !== value.length) {
    throw new BadRequestException('ids must be an array of non-empty strings');
  }
  return Array.from(new Set(ids));
}
