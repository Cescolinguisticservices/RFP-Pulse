import { getServerSession } from 'next-auth';

import type { Role, RFPStatus, WorkflowState } from '@rfp-pulse/db';

import { Card, CardContent } from '@/components/ui/card';
import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { RfpList, type RfpListRow } from './rfp-list';

const MANAGER_ROLES: Role[] = ['ADMIN', 'RFP_MANAGER'];

interface ProjectUserRef {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

interface ProjectSummary {
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

async function fetchProjects(accessToken: string): Promise<ProjectSummary[]> {
  const res = await fetch(`${apiBaseUrl()}/api/projects`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/projects failed: ${res.status}`);
  }
  const body = (await res.json()) as { projects: ProjectSummary[] };
  return body.projects;
}

export default async function RfpListPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return <p className="text-sm text-muted-foreground">Not authenticated.</p>;
  }

  const canManage = MANAGER_ROLES.includes(session.user.role);
  let projects: ProjectSummary[] = [];
  let error: string | null = null;
  try {
    projects = await fetchProjects(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  const rows: RfpListRow[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    clientName: p.clientName,
    status: p.status,
    createdAt: p.createdAt,
    dueAt: p.dueAt,
    createdBy: p.createdBy
      ? { id: p.createdBy.id, label: p.createdBy.name ?? p.createdBy.email }
      : null,
    assignee: p.assignee
      ? { id: p.assignee.id, label: p.assignee.name ?? p.assignee.email }
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">RFP</h1>
        <p className="text-sm text-muted-foreground">
          Every RFP in <strong>{session.user.tenantSlug}</strong>. Search, sort, and bulk-delete
          from here; start a new one with <strong>Create New RFP</strong>.
        </p>
      </header>

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load RFPs: {error}
          </CardContent>
        </Card>
      )}

      {!error && (
        <RfpList
          rows={rows}
          canManage={canManage}
          accessToken={session.accessToken}
          apiBase={apiBaseUrl()}
        />
      )}
    </div>
  );
}
