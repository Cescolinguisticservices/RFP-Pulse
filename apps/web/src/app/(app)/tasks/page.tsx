import { getServerSession } from 'next-auth';
import Link from 'next/link';

import type { LLMProvider, WorkflowState } from '@rfp-pulse/db';

import { cn } from '@/lib/utils';
import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';
import { TaskList, type QuestionSummary } from './task-list';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'DRAFTING', label: 'Drafting' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

async function fetchMine(accessToken: string, state: string): Promise<QuestionSummary[]> {
  const url = `${apiBaseUrl()}/api/questions/mine?state=${encodeURIComponent(state)}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/questions/mine failed: ${res.status}`);
  const body = (await res.json()) as { questions: QuestionSummary[] };
  return body.questions;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: { state?: string };
}): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) return <p className="text-sm text-muted-foreground">Not authenticated.</p>;

  const state = (searchParams?.state ?? 'DRAFTING').toUpperCase();

  let questions: QuestionSummary[] = [];
  let error: string | null = null;
  try {
    questions = await fetchMine(session.accessToken, state);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground">
          RFP questions assigned to you. Click{' '}
          <strong className="font-medium">Draft Response</strong> to invoke the RAG pipeline, then
          advance drafts through the editorial workflow.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" data-testid="state-filters">
        {FILTERS.map((f) => {
          const active = state === f.key;
          const href = f.key === 'DRAFTING' ? '/tasks' : `/tasks?state=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              data-testid={`filter-${f.key}`}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p className="text-sm text-destructive">Failed to load tasks: {error}</p>
      ) : (
        <TaskList
          initialQuestions={questions}
          accessToken={session.accessToken}
          apiBase={apiBaseUrl()}
          role={session.user.role}
        />
      )}
    </div>
  );
}

export type { WorkflowState, LLMProvider };
