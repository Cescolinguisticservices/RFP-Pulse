import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { Role } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { TenantsPanel, type TenantSummary } from './tenants-panel';

async function fetchTenants(accessToken: string): Promise<TenantSummary[]> {
  const res = await fetch(`${apiBaseUrl()}/api/tenants`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/tenants failed: ${res.status}`);
  const body = (await res.json()) as { tenants: TenantSummary[] };
  return body.tenants;
}

export default async function TenantsAdminPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/admin/tenants');
  if (session.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="text-sm text-destructive">
          Forbidden — only SUPER_ADMIN users may provision tenants.
        </p>
      </div>
    );
  }

  let tenants: TenantSummary[] = [];
  let error: string | null = null;
  try {
    tenants = await fetchTenants(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          Provision a new company. A temporary password for the initial ADMIN is shown once after
          creation — copy it before closing the modal.
        </p>
      </header>
      <TenantsPanel
        initialTenants={tenants}
        initialError={error}
        accessToken={session.accessToken}
        apiBase={apiBaseUrl()}
      />
    </div>
  );
}
