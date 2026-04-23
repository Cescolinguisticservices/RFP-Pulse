import { getServerSession } from 'next-auth';

import type { Role } from '@rfp-pulse/db';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';
import { UploadPanels } from './upload-panels';

const UPLOADER_ROLES: Role[] = ['ADMIN', 'RFP_MANAGER'];

export default async function UploadsPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) return <p className="text-sm text-muted-foreground">Not authenticated.</p>;

  const canUpload = UPLOADER_ROLES.includes(session.user.role);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Uploads</h1>
        <p className="text-sm text-muted-foreground">
          Ingest RFP documents (auto-indexed into the knowledge base) or competitor/FOIA documents
          (extracted for competitive intel).
        </p>
      </header>

      {canUpload ? (
        <UploadPanels accessToken={session.accessToken} apiBase={apiBaseUrl()} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Uploads require the <strong>ADMIN</strong> or <strong>RFP_MANAGER</strong> role. Your
          current role is <strong>{session.user.role}</strong>.
        </p>
      )}
    </div>
  );
}
