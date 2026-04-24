'use client';

import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generatingAnswers, setGeneratingAnswers] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);

  const [genError, setGenError] = useState<string | null>(null);
  const [answersError, setAnswersError] = useState<string | null>(null);
  const [answersInfo, setAnswersInfo] = useState<string | null>(null);

  const [pendingQuestionText, setPendingQuestionText] = useState<Record<string, string>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);

  const autoGenStarted = useRef(false);

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

  const refresh = useCallback(async (): Promise<void> => {
    const res = await fetch(`${apiBase}/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const body = (await res.json()) as RfpDetail;
    setProject(body.project);
    setQuestions(body.questions);
  }, [accessToken, apiBase, project.id]);

  const generateQuestions = useCallback(async (): Promise<void> => {
    setGeneratingQuestions(true);
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
      setGeneratingQuestions(false);
    }
  }, [accessToken, apiBase, project.id]);

  const generateAnswers = useCallback(async (): Promise<void> => {
    setGeneratingAnswers(true);
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
      const body = (await res.json()) as { message?: string };
      if (body.message) setAnswersInfo(body.message);
      await refresh();
    } catch (e) {
      setAnswersError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGeneratingAnswers(false);
    }
  }, [accessToken, apiBase, project.id, refresh]);

  useEffect(() => {
    if (!canManage) return;
    if (autoGenStarted.current) return;
    if (questions.length > 0) return;
    autoGenStarted.current = true;
    void (async () => {
      setAutoGenerating(true);
      await generateQuestions();
      await generateAnswers();
      setAutoGenerating(false);
    })();
  }, [canManage, questions.length, generateAnswers, generateQuestions]);

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

  async function saveQuestionEdits(): Promise<void> {
    const dirty = Object.entries(pendingQuestionText).filter(([id, text]) => {
      const q = questions.find((x) => x.id === id);
      return !!q && text.trim().length > 0 && text.trim() !== q.questionText;
    });
    if (dirty.length === 0) return;
    setSavingQuestions(true);
    setGenError(null);
    try {
      for (const [id, text] of dirty) {
        await patchQuestion(id, { questionText: text.trim() });
      }
      setPendingQuestionText({});
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to save question edits');
    } finally {
      setSavingQuestions(false);
    }
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
    setPendingQuestionText((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
          <CardTitle className="text-base">RFP View</CardTitle>
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

      <Card data-testid="rfp-detail-qa">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">AI-Generated Questions & Answers</CardTitle>
            <p className="text-xs text-muted-foreground">
              Questions are generated first, then answers are drafted from selected reference
              proposals.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void saveQuestionEdits()}
                disabled={savingQuestions || Object.keys(pendingQuestionText).length === 0}
                data-testid="rfp-save-questions"
              >
                {savingQuestions ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Questions
              </Button>
              <Button
                type="button"
                onClick={() => void generateQuestions()}
                disabled={generatingQuestions || !initial.document?.extractedText}
                data-testid="rfp-generate-questions"
                title={
                  !initial.document?.extractedText
                    ? 'This RFP has no extracted text to analyze. Re-upload the RFP document.'
                    : 'Use AI to extract questions from the RFP content'
                }
              >
                {generatingQuestions ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generatingQuestions ? 'Generating…' : 'Generate Questions'}
              </Button>
              <Button
                type="button"
                onClick={() => void generateAnswers()}
                disabled={generatingAnswers || questions.length === 0}
                data-testid="rfp-generate-answers"
              >
                {generatingAnswers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generatingAnswers ? 'Generating…' : 'Generate Answers'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {autoGenerating && (
            <p className="text-xs text-muted-foreground" data-testid="rfp-auto-generating">
              AI is generating questions and answers...
            </p>
          )}
          {genError && (
            <p className="text-xs text-destructive" data-testid="rfp-generate-error">
              {genError}
            </p>
          )}
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
            <p className="text-sm text-muted-foreground" data-testid="rfp-questions-empty">
              No questions yet. {canManage ? 'AI will generate on load, or add one manually below.' : ''}
            </p>
          ) : (
            <ul className="max-h-[520px] overflow-y-auto rounded-md border">
              {questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  users={users}
                  canManage={canManage}
                  draftText={pendingQuestionText[q.id] ?? q.questionText}
                  onDraftChange={(value) =>
                    setPendingQuestionText((prev) => ({ ...prev, [q.id]: value }))
                  }
                  expanded={expandedAnswers.has(q.id)}
                  onToggleExpand={() =>
                    setExpandedAnswers((prev) => {
                      const next = new Set(prev);
                      if (next.has(q.id)) next.delete(q.id);
                      else next.add(q.id);
                      return next;
                    })
                  }
                  onPatch={(patch) => patchQuestion(q.id, patch)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            </ul>
          )}

          {canManage && <AddQuestionRow users={users} onAdd={addQuestion} />}
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
  draftText,
  onDraftChange,
  expanded,
  onToggleExpand,
  onPatch,
  onDelete,
}: {
  question: RfpDetailQuestion;
  users: TenantUser[];
  canManage: boolean;
  draftText: string;
  onDraftChange: (value: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: {
    questionText?: string;
    assignedSmeId?: string | null;
    isSelected?: boolean;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const answer = question.answer?.content?.trim() ?? '';
  const isLong = answer.length > 420;
  const shownAnswer = !isLong || expanded ? answer : `${answer.slice(0, 420)}...`;

  return (
    <li className="flex flex-col gap-2 border-b p-3 last:border-b-0" data-testid={`question-row-${question.id}`}>
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
          <textarea
            value={draftText}
            disabled={!canManage}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            data-testid={`question-text-${question.id}`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              AI Answer
            </p>
            {answer ? (
              <>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{shownAnswer}</p>
                {isLong && (
                  <button
                    type="button"
                    onClick={onToggleExpand}
                    className="mt-2 text-xs text-primary hover:underline"
                    data-testid={`rfp-answer-expand-${question.id}`}
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No AI answer yet.</p>
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
