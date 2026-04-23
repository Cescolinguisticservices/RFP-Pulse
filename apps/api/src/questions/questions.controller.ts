import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { LLMProvider, Role, WorkflowState } from '@rfp-pulse/db';

import { DraftAnswerService } from '../ai/draft-answer.service';
import { ExtractQuestionsService } from '../ai/extract-questions.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface QuestionSummary {
  id: string;
  projectId: string;
  projectTitle: string;
  questionText: string;
  sectionPath: string | null;
  isSelected: boolean;
  state: WorkflowState;
  answer: {
    id: string;
    content: string;
    generatedBy: LLMProvider | null;
    updatedAt: string;
  } | null;
}

export interface ProjectQuestionRow {
  id: string;
  projectId: string;
  questionText: string;
  sectionPath: string | null;
  isSelected: boolean;
  assignee: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
  } | null;
  createdAt: string;
  updatedAt: string;
}

const MANAGE_ROLES = [Role.ADMIN, Role.RFP_MANAGER] as const;

@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafter: DraftAnswerService,
    private readonly extractor: ExtractQuestionsService,
  ) {}

  /**
   * Task list (Step 10): questions assigned to the caller, regardless of role.
   * Returns selected + unselected; the UI badges selected ones. Pass
   * `state=ALL` to include non-DRAFTING work; default returns DRAFTING only.
   */
  @Get('questions/mine')
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER, Role.READ_ONLY)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('state') stateFilter?: string,
  ): Promise<{ questions: QuestionSummary[] }> {
    const parsedState: WorkflowState | 'ALL' | null = parseStateFilter(stateFilter);

    const rows = await this.prisma.rFPQuestion.findMany({
      where: {
        tenantId: user.tenantId,
        assignedSmeId: user.id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { title: true } },
        answers: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });

    const questions = rows
      .map<QuestionSummary>((q) => {
        const a = q.answers[0] ?? null;
        return {
          id: q.id,
          projectId: q.projectId,
          projectTitle: q.project.title,
          questionText: q.questionText,
          sectionPath: q.sectionPath,
          isSelected: q.isSelected,
          state: a?.state ?? WorkflowState.DRAFTING,
          answer: a
            ? {
                id: a.id,
                content: a.content,
                generatedBy: a.generatedBy,
                updatedAt: a.updatedAt.toISOString(),
              }
            : null,
        };
      })
      .filter((q) => {
        if (parsedState === 'ALL') return true;
        if (parsedState) return q.state === parsedState;
        return q.state === WorkflowState.DRAFTING;
      });

    return { questions };
  }

  /** Draft Response button (Step 5.28): runs the RAG pipeline from Step 3. */
  @Post('questions/:id/draft')
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME)
  async draft(
    @Param('id') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('provider') providerOverride?: string,
  ): Promise<QuestionSummary> {
    const question = await this.prisma.rFPQuestion.findUnique({
      where: { id: questionId },
      include: { project: true },
    });
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);
    if (question.tenantId !== user.tenantId) {
      throw new ForbiddenException('Question belongs to a different tenant');
    }

    const existing = await this.prisma.rFPAnswer.findFirst({
      where: { questionId: question.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (
      existing &&
      existing.state !== WorkflowState.DRAFTING &&
      existing.state !== WorkflowState.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot re-draft an answer in ${existing.state} state. Only DRAFTING and REJECTED answers can be re-drafted.`,
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: question.tenantId },
    });
    const provider = normaliseProvider(providerOverride) ?? tenant.defaultProvider;

    const { draft, provider: usedProvider } = await this.drafter.draft({
      tenantId: user.tenantId,
      question: question.questionText,
      provider,
      topK: 3,
    });

    const providerEnum = providerNameToEnum(usedProvider);
    const answer = existing
      ? await this.prisma.rFPAnswer.update({
          where: { id: existing.id },
          data: {
            content: draft,
            state: WorkflowState.DRAFTING,
            generatedBy: providerEnum,
            authorId: user.id,
          },
        })
      : await this.prisma.rFPAnswer.create({
          data: {
            tenantId: user.tenantId,
            questionId: question.id,
            content: draft,
            state: WorkflowState.DRAFTING,
            generatedBy: providerEnum,
            authorId: user.id,
          },
        });

    return {
      id: question.id,
      projectId: question.projectId,
      projectTitle: question.project.title,
      questionText: question.questionText,
      sectionPath: question.sectionPath,
      isSelected: question.isSelected,
      state: answer.state,
      answer: {
        id: answer.id,
        content: answer.content,
        generatedBy: answer.generatedBy,
        updatedAt: answer.updatedAt.toISOString(),
      },
    };
  }

  /**
   * AI question generation for an RFP (Step 10). Reads the RFP document's
   * extractedText, sends it to the tenant's default LLM, and appends any
   * new questions to `rfp_questions` (unselected, unassigned). Skips
   * duplicates by case-insensitive text match.
   */
  @Post('projects/:id/questions/generate')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
  ): Promise<{ created: ProjectQuestionRow[]; skipped: number; questions: ProjectQuestionRow[] }> {
    const project = await this.prisma.rFPProject.findFirst({
      where: { id: projectId, tenantId: user.tenantId },
    });
    if (!project) throw new NotFoundException('RFP not found');

    const doc = await this.prisma.document.findFirst({
      where: { projectId: project.id, kind: 'RFP' },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc?.extractedText || doc.extractedText.trim().length === 0) {
      throw new BadRequestException(
        'This RFP has no extracted text to analyze. Re-upload the RFP document.',
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });

    const { questions: candidates } = await this.extractor.extract({
      extractedText: doc.extractedText,
      provider: tenant.defaultProvider,
    });

    const existing = await this.prisma.rFPQuestion.findMany({
      where: { projectId: project.id },
      select: { questionText: true },
    });
    const existingKeys = new Set(existing.map((e) => normaliseKey(e.questionText)));

    const toCreate: string[] = [];
    let skipped = 0;
    for (const text of candidates) {
      const key = normaliseKey(text);
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(key);
      toCreate.push(text);
    }

    if (toCreate.length > 0) {
      await this.prisma.rFPQuestion.createMany({
        data: toCreate.map((questionText) => ({
          tenantId: project.tenantId,
          projectId: project.id,
          questionText,
        })),
      });
    }

    const allRows = await this.fetchProjectQuestions(project.id);
    const createdSet = new Set(toCreate.map((t) => normaliseKey(t)));
    const created = allRows.filter((r) => createdSet.has(normaliseKey(r.questionText)));

    return { created, skipped, questions: allRows };
  }

  /** Manually add a question to an RFP. */
  @Post('projects/:id/questions')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async addQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Body() body: { questionText?: string; assignedSmeId?: string | null; isSelected?: boolean },
  ): Promise<ProjectQuestionRow> {
    const project = await this.prisma.rFPProject.findFirst({
      where: { id: projectId, tenantId: user.tenantId },
    });
    if (!project) throw new NotFoundException('RFP not found');

    const text = (body.questionText ?? '').trim();
    if (text.length === 0) {
      throw new BadRequestException('questionText is required');
    }

    await this.assertAssigneeInTenant(body.assignedSmeId, user.tenantId);

    const created = await this.prisma.rFPQuestion.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        questionText: text,
        assignedSmeId: body.assignedSmeId ?? null,
        isSelected: body.isSelected ?? false,
      },
      include: {
        assignedSme: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return toProjectQuestionRow(created);
  }

  @Patch('projects/:id/questions/:questionId')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async updateQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Param('questionId') questionId: string,
    @Body()
    body: {
      questionText?: string;
      assignedSmeId?: string | null;
      isSelected?: boolean;
    },
  ): Promise<ProjectQuestionRow> {
    const question = await this.prisma.rFPQuestion.findFirst({
      where: { id: questionId, projectId, tenantId: user.tenantId },
    });
    if (!question) throw new NotFoundException('Question not found');

    const data: { questionText?: string; assignedSmeId?: string | null; isSelected?: boolean } = {};

    if (body.questionText !== undefined) {
      const trimmed = body.questionText.trim();
      if (trimmed.length === 0) {
        throw new BadRequestException('questionText cannot be empty');
      }
      data.questionText = trimmed;
    }
    if (body.assignedSmeId !== undefined) {
      await this.assertAssigneeInTenant(body.assignedSmeId, user.tenantId);
      data.assignedSmeId = body.assignedSmeId;
    }
    if (body.isSelected !== undefined) {
      data.isSelected = Boolean(body.isSelected);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('no updatable fields provided');
    }

    const updated = await this.prisma.rFPQuestion.update({
      where: { id: questionId },
      data,
      include: {
        assignedSme: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    return toProjectQuestionRow(updated);
  }

  @Delete('projects/:id/questions/:questionId')
  @HttpCode(204)
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async deleteQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Param('questionId') questionId: string,
  ): Promise<void> {
    const question = await this.prisma.rFPQuestion.findFirst({
      where: { id: questionId, projectId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.prisma.rFPQuestion.delete({ where: { id: questionId } });
  }

  private async fetchProjectQuestions(projectId: string): Promise<ProjectQuestionRow[]> {
    const rows = await this.prisma.rFPQuestion.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        assignedSme: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    return rows.map(toProjectQuestionRow);
  }

  private async assertAssigneeInTenant(
    assigneeId: string | null | undefined,
    tenantId: string,
  ): Promise<void> {
    if (!assigneeId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('assignedSmeId does not belong to this tenant');
    }
  }
}

function toProjectQuestionRow(q: {
  id: string;
  projectId: string;
  questionText: string;
  sectionPath: string | null;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignedSme: { id: string; email: string; name: string | null; role: Role } | null;
}): ProjectQuestionRow {
  return {
    id: q.id,
    projectId: q.projectId,
    questionText: q.questionText,
    sectionPath: q.sectionPath,
    isSelected: q.isSelected,
    assignee: q.assignedSme,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

function normaliseKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseStateFilter(s: string | undefined): WorkflowState | 'ALL' | null {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'ALL') return 'ALL';
  if (upper in WorkflowState) return upper as WorkflowState;
  return null;
}

function normaliseProvider(s: string | undefined): LLMProvider | null {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper in LLMProvider) return upper as LLMProvider;
  return null;
}

function providerNameToEnum(name: string): LLMProvider {
  switch (name) {
    case 'openai':
      return LLMProvider.OPENAI;
    case 'gemini':
      return LLMProvider.GEMINI;
    case 'claude':
      return LLMProvider.CLAUDE;
    case 'llama':
      return LLMProvider.LLAMA;
    default:
      return LLMProvider.OPENAI;
  }
}

// Used by MANAGE_ROLES (prevents TS unused warning when decorators are evaluated at runtime).
void MANAGE_ROLES;
