'use client';

import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Role, RFPStatus } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { rfpStatusLabel, rfpStatusVariant } from '@/lib/rfp-status';
import { roleLabel } from '@/lib/roles';

import { RfpEditDialog } from '../../dashboard/rfp-edit-dialog';
import type { RfpListRow } from '../../dashboard/rfp-list';

import { RfpContentViewer } from './content-viewer';

export interface TenantUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

interface DetailUserRef {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface RfpDetailProject {
  id: string;
  title: string;
  clientName: string | null;
  dueAt: string | null;
  status: RFPStatus;
  createdBy: DetailUserRef | null;
  assignee: DetailUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface RfpDetailDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  docxBase64: string | null;
  pdfBase64: string | null;
  extractedText: string | null;
  extractedHtml: string | null;
}

export interface RfpDetailQuestion {
  id: string;
  questionText: string;
  sectionPath: string | null;
  isSelected: boolean;
  answer: {
    id: string;
    content: string;
    state: string;
    updatedAt: string;
  } | null;
  assignee: DetailUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface RfpDetail {
  project: RfpDetailProject;
  document: RfpDetailDocument | null;
  questions: RfpDetailQuestion[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function userLabel(u: DetailUserRef | TenantUser | null): string {
  if (!u) return '—';
  return u.name ?? u.email;
}

export function RfpDetailPanel({
  initial,
  users,
  canManage,
  accessToken,
  apiBase,
}: {
  initial: RfpDetail;
  users: TenantUser[];
  canManage: boolean;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const router = useRouter();
  const [project, setProject] = useState(initial.project);
  const [questions, setQuestions] = useState(initial.questions);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [answersGenerating, setAnswersGenerating] = useState(false);
  const [answersError, setAnswersError] = useState<string | null>(null);
  const [answersInfo, setAnswersInfo] = useState<string | null>(null);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);

  const editRow: RfpListRow = useMemo(
    () => ({
      id: project.id,
      title: project.title,
      clientName: project.clientName,
      status: project.status,
      createdAt: project.createdAt,
      dueAt: project.dueAt,
      createdBy: project.createdBy
        ? { id: project.createdBy.id, label: userLabel(project.createdBy) }
        : null,
      assignee: project.assignee
        ? { id: project.assignee.id, label: userLabel(project.assignee) }
        : null,
    }),
    [project],
  );

  async function refresh(): Promise<void> {
    const res = await fetch(`${apiBase}/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const body = (await res.json()) as RfpDetail;
    setProject(body.project);
    setQuestions(body.questions);
  }

  async function generateQuestions(): Promise<void> {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${project.id}/questions/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as { questions: RfpDetailQuestion[] };
      setQuestions(body.questions);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  }

  async function patchQuestion(
    id: string,
    patch: { questionText?: string; assignedSmeId?: string | null; isSelected?: boolean },
  ): Promise<void> {
    const res = await fetch(`${apiBase}/api/projects/${project.id}/questions/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `Failed (${res.status})`);
    }
    const updated = (await res.json()) as Omit<RfpDetailQuestion, 'answer'>;
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updated, answer: q.answer ?? null } : q)),
    );
  }

  async function addQuestion(text: string, assigneeId: string | null): Promise<void> {
    const res = await fetch(`${apiBase}/api/projects/${project.id}/questions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ questionText: text, assignedSmeId: assigneeId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `Failed (${res.status})`);
    }
    const created = (await res.json()) as Omit<RfpDetailQuestion, 'answer'>;
    setQuestions((prev) => [...prev, { ...created, answer: null }]);
  }

  async function deleteQuestion(id: string): Promise<void> {
    const res = await fetch(`${apiBase}/api/projects/${project.id}/questions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 204) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `Failed (${res.status})`);
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function generateAnswers(): Promise<void> {
    setAnswersGenerating(true);
    setAnswersError(null);
    setAnswersInfo(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${project.id}/answers/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as {
        generated: Array<{ questionId: string; content: string }>;
        message?: string;
      };
      if (body.message) setAnswersInfo(body.message);
      await refresh();
    } catch (e) {
      setAnswersError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAnswersGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back to RFPs
        </Link>
      </div>

      <Card data-testid="rfp-detail-header">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">{project.title}</CardTitle>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Edit RFP"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  data-testid="rfp-detail-edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {project.clientName && (
              <div className="text-sm text-muted-foreground">{project.clientName}</div>
            )}
          </div>
          <Badge variant={rfpStatusVariant(project.status)}>{rfpStatusLabel(project.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 pt-0 text-sm md:grid-cols-4">
          <MetaField label="Due date" value={formatDate(project.dueAt)} />
          <MetaField label="Date Added" value={formatDate(project.createdAt)} />
          <MetaField label="Added by" value={userLabel(project.createdBy)} />
          <MetaField label="Assigned to" value={userLabel(project.assignee)} />
        </CardContent>
      </Card>

      <Card data-testid="rfp-detail-content">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">RFP content</CardTitle>
          {initial.document && (
            <span className="text-xs text-muted-foreground">{initial.document.filename}</span>
          )}
        </CardHeader>
        <CardContent>
          <RfpContentViewer
            mimeType={initial.document?.mimeType ?? null}
            docxBase64={initial.document?.docxBase64 ?? null}
            pdfBase64={initial.document?.pdfBase64 ?? null}
            html={initial.document?.extractedHtml ?? null}
            text={initial.document?.extractedText ?? null}
          />
        </CardContent>
      </Card>

      <Card data-testid="rfp-detail-questions">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">AI-Generated Questions</CardTitle>
            <p className="text-xs text-muted-foreground">
              Select questions to include in the response; assign each to the person responsible.
              Selected + assigned questions appear on the assignee&apos;s Tasks page.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              onClick={() => void generateQuestions()}
              disabled={generating || !initial.document?.extractedText}
              data-testid="rfp-generate-questions"
              title={
                !initial.document?.extractedText
                  ? 'This RFP has no extracted text to analyze. Re-upload the RFP document.'
                  : 'Use AI to extract questions from the RFP content'
              }
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? 'Generating…' : 'Generate Questions'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {genError && (
            <p className="text-xs text-destructive" data-testid="rfp-generate-error">
              {genError}
            </p>
          )}
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="rfp-questions-empty">
              No questions yet.
              {canManage ? ' Click \u201cGenerate Questions\u201d or add one manually below.' : ''}
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  users={users}
                  canManage={canManage}
                  onPatch={(patch) => patchQuestion(q.id, patch)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            </ul>
          )}
          {canManage && <AddQuestionRow users={users} onAdd={addQuestion} />}
        </CardContent>
      </Card>

      <Card data-testid="rfp-detail-ai-answers">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">AI-Generated Answers</CardTitle>
            <p className="text-xs text-muted-foreground">
              Answers are generated after questions and grounded in selected reference proposals.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              onClick={() => void generateAnswers()}
              disabled={answersGenerating || questions.length === 0}
              data-testid="rfp-generate-answers"
            >
              {answersGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {answersGenerating ? 'Generating…' : 'Generate Answers'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {answersInfo && (
            <p className="text-xs text-muted-foreground" data-testid="rfp-generate-answers-info">
              {answersInfo}
            </p>
          )}
          {answersError && (
            <p className="text-xs text-destructive" data-testid="rfp-generate-answers-error">
              {answersError}
            </p>
          )}
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Generate questions first to create answer drafts.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {questions.map((q) => {
                const answer = q.answer?.content?.trim() ?? '';
                const isLong = answer.length > 420;
                const expanded = expandedAnswers.has(q.id);
                const shown = !isLong || expanded ? answer : `${answer.slice(0, 420)}...`;
                return (
                  <li key={`answer-${q.id}`} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{q.questionText}</p>
                    {answer ? (
                      <>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{shown}</p>
                        {isLong && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAnswers((prev) => {
                                const next = new Set(prev);
                                if (next.has(q.id)) next.delete(q.id);
                                else next.add(q.id);
                                return next;
                              })
                            }
                            className="mt-2 text-xs text-primary hover:underline"
                            data-testid={`rfp-answer-expand-${q.id}`}
                          >
                            {expanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No answer yet. {canManage ? 'Click Generate Answers.' : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <RfpEditDialog
          row={editRow}
          apiBase={apiBase}
          accessToken={accessToken}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function QuestionRow({
  question,
  users,
  canManage,
  onPatch,
  onDelete,
}: {
  question: RfpDetailQuestion;
  users: TenantUser[];
  canManage: boolean;
  onPatch: (patch: {
    questionText?: string;
    assignedSmeId?: string | null;
    isSelected?: boolean;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}): JSX.Element {
  const [text, setText] = useState(question.questionText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textDirty = text !== question.questionText;

  async function run<T>(fn: () => Promise<T>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3" data-testid={`question-row-${question.id}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-2 h-4 w-4"
          checked={question.isSelected}
          disabled={!canManage || busy}
          onChange={(e) => void run(() => onPatch({ isSelected: e.target.checked }))}
          aria-label="Select question for response"
          data-testid={`question-checkbox-${question.id}`}
        />
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={text}
            disabled={!canManage || busy}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (textDirty) void run(() => onPatch({ questionText: text }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textDirty) {
                e.preventDefault();
                void run(() => onPatch({ questionText: text }));
              }
            }}
            data-testid={`question-text-${question.id}`}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Assigned to</span>
            <Select
              value={question.assignee?.id ?? ''}
              disabled={!canManage || busy}
              onChange={(e) =>
                void run(() =>
                  onPatch({ assignedSmeId: e.target.value === '' ? null : e.target.value }),
                )
              }
              className="h-8 w-56 text-xs"
              data-testid={`question-assignee-${question.id}`}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)} ({roleLabel(u.role)})
                </option>
              ))}
            </Select>
            {question.isSelected && (
              <Badge variant="default" className="text-[10px]">
                Selected
              </Badge>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => void run(() => onDelete())}
            disabled={busy}
            aria-label="Delete question"
            className="mt-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            data-testid={`question-delete-${question.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function AddQuestionRow({
  users,
  onAdd,
}: {
  users: TenantUser[];
  onAdd: (text: string, assigneeId: string | null) => Promise<void>;
}): JSX.Element {
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(trimmed, assigneeId === '' ? null : assigneeId);
      setText('');
      setAssigneeId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 flex flex-col gap-2 rounded-md border border-dashed p-3"
      data-testid="question-add-form"
    >
      <label className="text-xs font-medium text-muted-foreground">Add a question</label>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's the required delivery timeline?"
          className="flex-1"
          data-testid="question-add-text"
        />
        <Select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="h-9 w-56 text-xs"
          data-testid="question-add-assignee"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {userLabel(u)} ({roleLabel(u.role)})
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          disabled={busy || text.trim().length === 0}
          data-testid="question-add-submit"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
