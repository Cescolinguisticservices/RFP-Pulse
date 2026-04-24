import { getServerSession } from 'next-auth';

import type { Role } from '@rfp-pulse/db';

import { Card, CardContent } from '@/components/ui/card';
import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { ProposalUploadForm } from './proposal-upload-form';

const UPLOADER_ROLES: Role[] = ['ADMIN', 'RFP_MANAGER'];

export default async function ProposalUploadPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return <p className="text-sm text-muted-foreground">Not authenticated.</p>;
  }

  const canUpload = UPLOADER_ROLES.includes(session.user.role);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Proposal Upload</h1>
        <p className="text-sm text-muted-foreground">
          Create a new proposal by entering metadata and uploading the proposal document.
        </p>
      </header>

      {canUpload ? (
        <ProposalUploadForm accessToken={session.accessToken} apiBase={apiBaseUrl()} />
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Uploads require the <strong>ADMIN</strong> or <strong>RFP_MANAGER</strong> role. Your
            current role is <strong>{session.user.role}</strong>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
