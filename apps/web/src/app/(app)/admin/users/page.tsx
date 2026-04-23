import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { Role } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { UsersPanel, type UserSummary } from './users-panel';

async function fetchUsers(accessToken: string): Promise<UserSummary[]> {
  const res = await fetch(`${apiBaseUrl()}/api/users`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/users failed: ${res.status}`);
  const body = (await res.json()) as { users: UserSummary[] };
  return body.users;
}

export default async function UsersAdminPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/admin/users');
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-destructive">
          Forbidden — only tenant ADMIN users may manage user accounts.
        </p>
      </div>
    );
  }

  let users: UserSummary[] = [];
  let error: string | null = null;
  try {
    users = await fetchUsers(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite users to <strong>{session.user.tenantSlug}</strong>. A temporary password is
          generated for each invitee and shown once — copy it before closing the panel.
        </p>
      </header>
      <UsersPanel
        initialUsers={users}
        initialError={error}
        accessToken={session.accessToken}
        apiBase={apiBaseUrl()}
        currentUserId={session.user.id}
      />
    </div>
  );
}
