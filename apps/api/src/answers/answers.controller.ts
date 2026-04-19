import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { LLMProvider, Role, WorkflowState } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface TransitionResult {
  id: string;
  questionId: string;
  state: WorkflowState;
  generatedBy: LLMProvider | null;
  updatedAt: string;
}

/**
 * Adjacency list for the editorial state machine:
 * `{ from: [[to, rolesAllowed]] }`.
 */
const TRANSITIONS: Record<WorkflowState, Array<{ to: WorkflowState; roles: Role[] }>> = {
  [WorkflowState.DRAFTING]: [
    {
      to: WorkflowState.IN_REVIEW,
      roles: [Role.ADMIN, Role.RFP_MANAGER, Role.SME],
    },
  ],
  [WorkflowState.IN_REVIEW]: [
    {
      to: WorkflowState.PENDING_APPROVAL,
      roles: [Role.ADMIN, Role.RFP_MANAGER, Role.REVIEWER],
    },
    {
      to: WorkflowState.DRAFTING,
      roles: [Role.ADMIN, Role.RFP_MANAGER, Role.REVIEWER],
    },
  ],
  [WorkflowState.PENDING_APPROVAL]: [
    { to: WorkflowState.APPROVED, roles: [Role.ADMIN, Role.APPROVER] },
    { to: WorkflowState.REJECTED, roles: [Role.ADMIN, Role.APPROVER] },
  ],
  [WorkflowState.APPROVED]: [],
  [WorkflowState.REJECTED]: [
    {
      to: WorkflowState.DRAFTING,
      roles: [Role.ADMIN, Role.RFP_MANAGER, Role.SME],
    },
  ],
};

@Controller('api/answers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnswersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Editorial workflow transition (master-prompt Core Module 4). Enforces the
   * state machine defined in {@link TRANSITIONS} and role-per-edge
   * permissions, then persists the new state on the `RFPAnswer`.
   */
  @Post(':id/transition')
  @Roles(Role.ADMIN, Role.RFP_MANAGER, Role.SME, Role.REVIEWER, Role.APPROVER)
  async transition(
    @Param('id') answerId: string,
    @Body('to') requestedTo: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransitionResult> {
    const to = parseWorkflowState(requestedTo);

    const answer = await this.prisma.rFPAnswer.findUnique({ where: { id: answerId } });
    if (!answer) throw new NotFoundException(`Answer ${answerId} not found`);
    if (answer.tenantId !== user.tenantId) {
      throw new ForbiddenException('Answer belongs to a different tenant');
    }

    const edges = TRANSITIONS[answer.state] ?? [];
    const edge = edges.find((e) => e.to === to);
    if (!edge) {
      throw new BadRequestException(
        `Invalid transition ${answer.state} -> ${to}. Allowed next states: ${
          edges.map((e) => e.to).join(', ') || '(none — terminal)'
        }`,
      );
    }
    if (!edge.roles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} cannot perform ${answer.state} -> ${to} transition. Requires one of: ${edge.roles.join(', ')}`,
      );
    }

    const next = await this.prisma.rFPAnswer.update({
      where: { id: answer.id },
      data: {
        state: to,
        ...(to === WorkflowState.IN_REVIEW ? { reviewerId: user.id } : {}),
      },
    });

    return {
      id: next.id,
      questionId: next.questionId,
      state: next.state,
      generatedBy: next.generatedBy,
      updatedAt: next.updatedAt.toISOString(),
    };
  }
}

function parseWorkflowState(value: string | undefined): WorkflowState {
  if (!value) {
    throw new BadRequestException('Missing required body field "to"');
  }
  const upper = value.toUpperCase();
  const all = Object.values(WorkflowState) as string[];
  if (!all.includes(upper)) {
    throw new BadRequestException(`Invalid state "${value}". Must be one of: ${all.join(', ')}`);
  }
  return upper as WorkflowState;
}
