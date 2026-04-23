import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';

export default async function HomePage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          MVP · Step 5 · Dashboards &amp; Workflow
        </span>
        <h1 className="text-4xl font-bold tracking-tight">RFP Pulse</h1>
        <p className="max-w-xl text-muted-foreground">
          AI-driven, multi-tenant RFP response management. Sign in to view your project dashboard
          and SME task list.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link className="rounded-md border px-4 py-2 font-medium hover:bg-accent" href="/login">
          Sign in →
        </Link>
        <a
          className="rounded-md border px-4 py-2 font-medium hover:bg-accent"
          href="https://github.com/Cescolinguisticservices/rfp-pulse"
          target="_blank"
          rel="noreferrer"
        >
          Repository →
        </a>
      </div>
    </main>
  );
}
