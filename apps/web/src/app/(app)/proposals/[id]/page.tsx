import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';

import type { RFPStatus, Role } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { ProposalDetailPanel, type ProposalDetailResponse } from './detail-panel';

type ProposalStatus = Extract<RFPStatus, 'SUBMITTED' | 'WON' | 'LOST'>;

const MANAGER_ROLES: Role[] = ['ADMIN', 'RFP_MANAGER'];

async function fetchDetail(id: string, accessToken: string): Promise<ProposalDetailResponse | null> {
  const res = await fetch(`${apiBaseUrl()}/api/projects/${id}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/projects/${id} failed: ${res.status}`);
  return (await res.json()) as ProposalDetailResponse;
}

function isProposalStatus(status: RFPStatus): status is ProposalStatus {
  return status === 'SUBMITTED' || status === 'WON' || status === 'LOST';
}

export default async function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?callbackUrl=/proposals/${params.id}`);

  const canManage = MANAGER_ROLES.includes(session.user.role);
  const detail = await fetchDetail(params.id, session.accessToken);
  if (!detail) notFound();
  if (!isProposalStatus(detail.project.status)) notFound();

  return (
    <ProposalDetailPanel
      initial={detail}
      canManage={canManage}
      accessToken={session.accessToken}
      apiBase={apiBaseUrl()}
    />
  );
}
