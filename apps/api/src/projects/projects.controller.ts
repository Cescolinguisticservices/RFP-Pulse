import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { DocumentKind, Role, RFPStatus, WorkflowState } from '@rfp-pulse/db';

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

export interface UpdateProjectBody {
  title?: unknown;
  clientName?: unknown;
  dueDate?: unknown;
  status?: unknown;
  assigneeId?: unknown;
  createdById?: unknown;
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

  /**
   * RFP detail endpoint (Step 10). Returns the project, the latest RFP
   * document (if any) with its extracted text, and the full question list.
   * Tenant-scoped; cross-tenant reads 404.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER, Role.READ_ONLY)
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{
    project: ProjectSummary;
    document: {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      extractedText: string | null;
      extractedHtml: string | null;
    } | null;
    questions: Array<{
      id: string;
      questionText: string;
      sectionPath: string | null;
      isSelected: boolean;
      assignee: ProjectUserRef | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const project = await this.prisma.rFPProject.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, email: true, name: true, role: true } },
        assignee: { select: { id: true, email: true, name: true, role: true } },
        questions: {
          orderBy: { createdAt: 'asc' },
          include: {
            assignedSme: { select: { id: true, email: true, name: true, role: true } },
            answers: { select: { state: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
          },
        },
        documents: {
          where: { kind: DocumentKind.RFP },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!project) throw new NotFoundException('RFP not found');

    const stateCounts: Record<WorkflowState, number> = {
      DRAFTING: 0,
      IN_REVIEW: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const q of project.questions) {
      const state = q.answers[0]?.state ?? WorkflowState.DRAFTING;
      stateCounts[state] += 1;
    }

    const doc = project.documents[0] ?? null;

    return {
      project: {
        id: project.id,
        title: project.title,
        clientName: project.clientName,
        dueAt: project.dueAt ? project.dueAt.toISOString() : null,
        status: project.status,
        createdBy: project.createdBy ?? null,
        assignee: project.assignee ?? null,
        questionCount: project.questions.length,
        stateCounts,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
      document: doc
        ? {
            id: doc.id,
            filename: doc.filename,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            extractedText: doc.extractedText,
            extractedHtml: doc.extractedHtml,
          }
        : null,
      questions: project.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        sectionPath: q.sectionPath,
        isSelected: q.isSelected,
        assignee: q.assignedSme ?? null,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
      })),
    };
  }

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
   * Patch mutable fields on a single RFP project. All updates are
   * tenant-scoped; cross-tenant id probes return 404. Any user picked for
   * `createdById` or `assigneeId` must belong to the caller's tenant.
   */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateProjectBody,
  ): Promise<{ project: ProjectSummary }> {
    const existing = await this.prisma.rFPProject.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('RFP not found');
    }

    const data = await this.buildUpdateData(body, user.tenantId);
    const updated = await this.prisma.rFPProject.update({
      where: { id },
      data,
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

    const stateCounts: Record<WorkflowState, number> = {
      DRAFTING: 0,
      IN_REVIEW: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const q of updated.questions) {
      const state = q.answers[0]?.state ?? WorkflowState.DRAFTING;
      stateCounts[state] += 1;
    }
    return {
      project: {
        id: updated.id,
        title: updated.title,
        clientName: updated.clientName,
        dueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
        status: updated.status,
        createdBy: updated.createdBy ?? null,
        assignee: updated.assignee ?? null,
        questionCount: updated.questions.length,
        stateCounts,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  private async buildUpdateData(
    body: UpdateProjectBody,
    tenantId: string,
  ): Promise<{
    title?: string;
    clientName?: string | null;
    dueAt?: Date | null;
    status?: RFPStatus;
    createdById?: string | null;
    assigneeId?: string | null;
  }> {
    const data: {
      title?: string;
      clientName?: string | null;
      dueAt?: Date | null;
      status?: RFPStatus;
      createdById?: string | null;
      assigneeId?: string | null;
    } = {};

    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) throw new BadRequestException('title must be a non-empty string');
      data.title = title;
    }
    if (body.clientName !== undefined) {
      if (body.clientName === null) {
        data.clientName = null;
      } else if (typeof body.clientName === 'string') {
        const v = body.clientName.trim();
        data.clientName = v.length > 0 ? v : null;
      } else {
        throw new BadRequestException('clientName must be a string or null');
      }
    }
    if (body.dueDate !== undefined) {
      data.dueAt = parseNullableDate(body.dueDate, 'dueDate');
    }
    if (body.status !== undefined) {
      data.status = parseStatus(body.status);
    }
    if (body.assigneeId !== undefined) {
      data.assigneeId = await this.resolveTenantUserId(body.assigneeId, tenantId, 'assigneeId');
    }
    if (body.createdById !== undefined) {
      data.createdById = await this.resolveTenantUserId(body.createdById, tenantId, 'createdById');
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('no updatable fields provided');
    }
    return data;
  }

  private async resolveTenantUserId(
    value: unknown,
    tenantId: string,
    field: string,
  ): Promise<string | null> {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string or null`);
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    const exists = await this.prisma.user.findFirst({
      where: { id: trimmed, tenantId },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException(`${field} does not belong to this tenant`);
    }
    return trimmed;
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

function parseNullableDate(value: unknown, field: string): Date | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} "${trimmed}" is not a valid date`);
  }
  return date;
}

const ALL_STATUSES: RFPStatus[] = [
  RFPStatus.DRAFT,
  RFPStatus.IN_PROGRESS,
  RFPStatus.UNDER_REVIEW,
  RFPStatus.APPROVED,
  RFPStatus.SUBMITTED,
  RFPStatus.WON,
  RFPStatus.LOST,
  RFPStatus.CANCELLED,
];

function parseStatus(value: unknown): RFPStatus {
  if (typeof value !== 'string') {
    throw new BadRequestException('status must be a string');
  }
  const upper = value.trim().toUpperCase();
  const match = ALL_STATUSES.find((s) => s === upper);
  if (!match) {
    throw new BadRequestException(`status must be one of: ${ALL_STATUSES.join(', ')}`);
  }
  return match;
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
