import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSessionProvider } from '@/components/session-provider';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }

  return (
    <AppSessionProvider session={session}>
      <div className="flex min-h-screen bg-muted/30">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-8 py-10">{children}</div>
        </main>
      </div>
    </AppSessionProvider>
  );
}
