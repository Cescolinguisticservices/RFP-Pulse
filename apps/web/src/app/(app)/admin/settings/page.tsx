import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { LLMProvider, Role } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { SettingsPanel } from './settings-panel';

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  defaultProvider: LLMProvider;
  createdAt: string;
}

async function fetchMyTenant(accessToken: string): Promise<TenantSummary> {
  const res = await fetch(`${apiBaseUrl()}/api/tenants/me`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/tenants/me failed: ${res.status}`);
  return (await res.json()) as TenantSummary;
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/admin/settings');
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-destructive">
          Forbidden — only tenant ADMIN users may change tenant settings.
        </p>
      </div>
    );
  }

  let tenant: TenantSummary | null = null;
  let error: string | null = null;
  try {
    tenant = await fetchMyTenant(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Tenant settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure defaults for <strong>{session.user.tenantSlug}</strong>.
        </p>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {tenant && (
        <SettingsPanel tenant={tenant} accessToken={session.accessToken} apiBase={apiBaseUrl()} />
      )}
    </div>
  );
}
