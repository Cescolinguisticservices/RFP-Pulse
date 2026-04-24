import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }
  // Force users invited with a temp password to change it before using the app.
  // The change-password page lives outside the (app) group so this redirect
  // doesn't loop.
  if (session.user.passwordMustChange) {
    redirect('/account/change-password');
  }

  return (
    <div className="flex h-screen bg-muted/30">
      <section className="w-60 shrink-0 border-r bg-card">
        <AppSidebar />
      </section>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
