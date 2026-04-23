import { getServerSession } from 'next-auth';

import type { WorkflowState } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';
import { formatDistanceToNowStrict } from '@/lib/format';
import { workflowStateLabel, workflowStateVariant } from '@/lib/workflow';

interface ProjectSummary {
  id: string;
  title: string;
  clientName: string | null;
  dueAt: string | null;
  questionCount: number;
  stateCounts: Record<WorkflowState, number>;
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

export default async function DashboardPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return <p className="text-sm text-muted-foreground">Not authenticated.</p>;
  }

  let projects: ProjectSummary[] = [];
  let error: string | null = null;
  try {
    projects = await fetchProjects(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">RFP Projects</h1>
        <p className="text-sm text-muted-foreground">
          Manager dashboard — every active RFP in{' '}
          <strong className="font-medium">{session.user.tenantSlug}</strong> with workflow status
          rolled up across its questions.
        </p>
      </header>

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load projects: {error}
          </CardContent>
        </Card>
      )}

      {!error && projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Run <code className="font-mono">pnpm db:seed</code> to populate demo data, or upload
              an RFP document via <code className="font-mono">POST /api/upload-rfp</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active Projects</CardTitle>
            <CardDescription>
              Sorted by most recent activity. Status badges show the workflow state of each
              question&apos;s latest draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table data-testid="projects-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id} data-testid={`project-row-${p.id}`}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-muted-foreground">{p.clientName ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {p.questionCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(p.stateCounts) as WorkflowState[])
                          .filter((s) => p.stateCounts[s] > 0)
                          .map((s) => (
                            <Badge key={s} variant={workflowStateVariant(s)}>
                              {workflowStateLabel(s)} · {p.stateCounts[s]}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.dueAt ? `in ${formatDistanceToNowStrict(new Date(p.dueAt))}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
