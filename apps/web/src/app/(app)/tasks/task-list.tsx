'use client';

import { Loader2, Send, Sparkles, ThumbsDown, ThumbsUp, Undo2 } from 'lucide-react';
import { useState } from 'react';

import type { LLMProvider, Role, WorkflowState } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { workflowStateLabel, workflowStateVariant } from '@/lib/workflow';

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

interface TransitionAction {
  to: WorkflowState;
  label: string;
  icon: typeof Send;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

const DRAFTING_ACTIONS: TransitionAction[] = [
  { to: 'IN_REVIEW', label: 'Submit for Review', icon: Send, variant: 'default' },
];
const IN_REVIEW_ACTIONS: TransitionAction[] = [
  { to: 'PENDING_APPROVAL', label: 'Send to Approver', icon: Send, variant: 'default' },
  { to: 'DRAFTING', label: 'Send Back', icon: Undo2, variant: 'outline' },
];
const PENDING_APPROVAL_ACTIONS: TransitionAction[] = [
  { to: 'APPROVED', label: 'Approve', icon: ThumbsUp, variant: 'default' },
  { to: 'REJECTED', label: 'Reject', icon: ThumbsDown, variant: 'destructive' },
];
const REJECTED_ACTIONS: TransitionAction[] = [
  { to: 'DRAFTING', label: 'Rework', icon: Undo2, variant: 'outline' },
];

function actionsFor(state: WorkflowState, role: Role): TransitionAction[] {
  switch (state) {
    case 'DRAFTING':
      return role === 'ADMIN' || role === 'RFP_MANAGER' || role === 'SME' ? DRAFTING_ACTIONS : [];
    case 'IN_REVIEW':
      return role === 'ADMIN' || role === 'RFP_MANAGER' || role === 'REVIEWER'
        ? IN_REVIEW_ACTIONS
        : [];
    case 'PENDING_APPROVAL':
      return role === 'ADMIN' || role === 'APPROVER' ? PENDING_APPROVAL_ACTIONS : [];
    case 'REJECTED':
      return role === 'ADMIN' || role === 'RFP_MANAGER' || role === 'SME' ? REJECTED_ACTIONS : [];
    case 'APPROVED':
      return [];
    default:
      return [];
  }
}

export function TaskList({
  initialQuestions,
  accessToken,
  apiBase,
  role,
}: {
  initialQuestions: QuestionSummary[];
  accessToken: string;
  apiBase: string;
  role: Role;
}): JSX.Element {
  const [questions, setQuestions] = useState<QuestionSummary[]>(initialQuestions);
  const [draftingIds, setDraftingIds] = useState<Set<string>>(new Set());
  const [transitioningIds, setTransitioningIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});

  function clearError(id: string): void {
    setErrorIds((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function handleDraft(questionId: string): Promise<void> {
    setDraftingIds((prev) => new Set(prev).add(questionId));
    clearError(questionId);
    try {
      const res = await fetch(`${apiBase}/api/questions/${questionId}/draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`Draft request failed: ${res.status} ${res.statusText}`);
      }
      const updated = (await res.json()) as QuestionSummary;
      setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    } catch (e) {
      setErrorIds((prev) => ({
        ...prev,
        [questionId]: e instanceof Error ? e.message : 'Unknown error',
      }));
    } finally {
      setDraftingIds((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  async function handleTransition(question: QuestionSummary, to: WorkflowState): Promise<void> {
    if (!question.answer) return;
    const answerId = question.answer.id;
    setTransitioningIds((prev) => new Set(prev).add(answerId));
    clearError(question.id);
    try {
      const res = await fetch(`${apiBase}/api/answers/${answerId}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Transition failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
        );
      }
      const transitioned = (await res.json()) as {
        id: string;
        state: WorkflowState;
        updatedAt: string;
        generatedBy: LLMProvider | null;
      };
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id && q.answer
            ? {
                ...q,
                state: transitioned.state,
                answer: {
                  ...q.answer,
                  generatedBy: transitioned.generatedBy,
                  updatedAt: transitioned.updatedAt,
                },
              }
            : q,
        ),
      );
    } catch (e) {
      setErrorIds((prev) => ({
        ...prev,
        [question.id]: e instanceof Error ? e.message : 'Unknown error',
      }));
    } finally {
      setTransitioningIds((prev) => {
        const next = new Set(prev);
        next.delete(answerId);
        return next;
      });
    }
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing here</CardTitle>
          <CardDescription>
            No RFP questions match the current filter. Try a different state or upload an RFP.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="task-list">
      {questions.map((q) => {
        const drafting = draftingIds.has(q.id);
        const transitionBusy = q.answer ? transitioningIds.has(q.answer.id) : false;
        const error = errorIds[q.id];
        const actions = q.answer ? actionsFor(q.state, role) : [];
        return (
          <Card key={q.id} data-testid={`task-${q.id}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <CardDescription className="flex items-center gap-2 text-xs">
                  <span>{q.projectTitle}</span>
                  {q.sectionPath && <span>· {q.sectionPath}</span>}
                </CardDescription>
                <CardTitle className="text-base">{q.questionText}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {q.isSelected && (
                  <Badge
                    variant="default"
                    className="text-[10px]"
                    data-testid={`selected-badge-${q.id}`}
                  >
                    Selected
                  </Badge>
                )}
                <Badge variant={workflowStateVariant(q.state)}>{workflowStateLabel(q.state)}</Badge>
                {q.state === 'DRAFTING' &&
                  (role === 'ADMIN' || role === 'RFP_MANAGER' || role === 'SME') && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleDraft(q.id)}
                      disabled={drafting}
                      data-testid={`draft-button-${q.id}`}
                    >
                      {drafting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Drafting…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Draft Response
                        </>
                      )}
                    </Button>
                  )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {q.answer ? (
                <>
                  <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed">
                    {q.answer.content}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {q.answer.generatedBy ? `Generated by ${q.answer.generatedBy}` : 'Manual draft'}
                    {' · '}
                    Updated {new Date(q.answer.updatedAt).toLocaleString()}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No draft yet.</p>
              )}
              {actions.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`transitions-${q.id}`}
                >
                  {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Button
                        key={`${q.id}-${action.to}`}
                        type="button"
                        size="sm"
                        variant={action.variant ?? 'default'}
                        onClick={() => handleTransition(q, action.to)}
                        disabled={transitionBusy}
                        data-testid={`transition-${q.id}-${action.to}`}
                      >
                        {transitionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              )}
              {error && (
                <p className="text-xs text-destructive" data-testid={`task-error-${q.id}`}>
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
