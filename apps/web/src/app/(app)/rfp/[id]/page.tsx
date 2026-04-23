import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';

import type { Role, RFPStatus } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { RfpDetailPanel, type RfpDetail, type TenantUser } from './detail-panel';

const MANAGER_ROLES: Role[] = ['ADMIN', 'RFP_MANAGER'];

async function fetchDetail(id: string, accessToken: string): Promise<RfpDetail | null> {
  const res = await fetch(`${apiBaseUrl()}/api/projects/${id}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/projects/${id} failed: ${res.status}`);
  return (await res.json()) as RfpDetail;
}

async function fetchAssignableUsers(accessToken: string): Promise<TenantUser[]> {
  const res = await fetch(`${apiBaseUrl()}/api/users/assignable`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { users: TenantUser[] };
  return body.users;
}

export default async function RfpDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?callbackUrl=/rfp/${params.id}`);

  const canManage = MANAGER_ROLES.includes(session.user.role);

  const [detail, users] = await Promise.all([
    fetchDetail(params.id, session.accessToken),
    fetchAssignableUsers(session.accessToken),
  ]);
  if (!detail) notFound();

  return (
    <RfpDetailPanel
      initial={detail}
      users={users}
      canManage={canManage}
      accessToken={session.accessToken}
      apiBase={apiBaseUrl()}
    />
  );
}

export type { RFPStatus };
