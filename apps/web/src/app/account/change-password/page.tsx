import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';

import { ChangePasswordForm } from './change-password-form';

export default async function ChangePasswordPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login?callbackUrl=/account/change-password');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Change your password</h1>
        {session.user.passwordMustChange ? (
          <p className="text-sm text-muted-foreground">
            Your account was provisioned with a temporary password. Set a new password to continue.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Update the password for your account.</p>
        )}
      </div>
      <ChangePasswordForm forced={session.user.passwordMustChange} />
    </main>
  );
}
