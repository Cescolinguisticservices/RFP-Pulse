import { getServerSession } from 'next-auth';

import type { LLMProvider, WorkflowState } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';
import { TaskList, type QuestionSummary } from './task-list';

async function fetchMine(accessToken: string): Promise<QuestionSummary[]> {
  const res = await fetch(`${apiBaseUrl()}/api/questions/mine`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/questions/mine failed: ${res.status}`);
  const body = (await res.json()) as { questions: QuestionSummary[] };
  return body.questions;
}

export default async function TasksPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) return <p className="text-sm text-muted-foreground">Not authenticated.</p>;

  let questions: QuestionSummary[] = [];
  let error: string | null = null;
  try {
    questions = await fetchMine(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground">
          RFP questions assigned to you that are currently in{' '}
          <strong className="font-medium">Drafting</strong>. Click{' '}
          <strong className="font-medium">Draft Response</strong> to invoke the RAG pipeline.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive">Failed to load tasks: {error}</p>
      ) : (
        <TaskList
          initialQuestions={questions}
          accessToken={session.accessToken}
          apiBase={apiBaseUrl()}
        />
      )}
    </div>
  );
}

export type { WorkflowState, LLMProvider };
