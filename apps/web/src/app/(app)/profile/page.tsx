import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';

import { ProfilePanel } from './profile-panel';

export default async function ProfilePage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/profile');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your display name and change your password. Email, role, and tenant are managed by
          an admin.
        </p>
      </header>
      <ProfilePanel
        accessToken={session.accessToken}
        apiBase={apiBaseUrl()}
        initialName={session.user.name ?? ''}
        email={session.user.email}
        tenantSlug={session.user.tenantSlug}
        roleKey={session.user.role}
      />
    </div>
  );
}
