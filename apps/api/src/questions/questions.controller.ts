import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { LLMProvider, Role, WorkflowState } from '@rfp-pulse/db';

import { DraftAnswerService } from '../ai/draft-answer.service';
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
  state: WorkflowState;
  answer: {
    id: string;
    content: string;
    generatedBy: LLMProvider | null;
    updatedAt: string;
  } | null;
}

@Controller('api/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafter: DraftAnswerService,
  ) {}

  /** SME task list (Step 5.27): questions assigned to the caller, optionally filtered by state. */
  @Get('mine')
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('state') stateFilter?: string,
  ): Promise<{ questions: QuestionSummary[] }> {
    const parsedState = parseStateFilter(stateFilter);

    const rows = await this.prisma.rFPQuestion.findMany({
      where: {
        tenantId: user.tenantId,
        // Admins / managers see all DRAFTING work; SMEs see only their assignments.
        ...(user.role === Role.SME ? { assignedSmeId: user.id } : {}),
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
      .filter((q) => (parsedState ? q.state === parsedState : q.state === WorkflowState.DRAFTING));

    return { questions };
  }

  /** Draft Response button (Step 5.28): runs the RAG pipeline from Step 3. */
  @Post(':id/draft')
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

    const existing = await this.prisma.rFPAnswer.findFirst({
      where: { questionId: question.id },
      orderBy: { updatedAt: 'desc' },
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
      state: answer.state,
      answer: {
        id: answer.id,
        content: answer.content,
        generatedBy: answer.generatedBy,
        updatedAt: answer.updatedAt.toISOString(),
      },
    };
  }
}

function parseStateFilter(s: string | undefined): WorkflowState | null {
  if (!s) return null;
  const upper = s.toUpperCase();
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
