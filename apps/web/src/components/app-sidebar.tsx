'use client';

import { ClipboardList, LayoutDashboard, LogOut, Radar, UploadCloud, Zap } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: LayoutDashboard, testId: 'nav-dashboard' },
  { href: '/tasks', label: 'My Tasks', icon: ClipboardList, testId: 'nav-tasks' },
  { href: '/uploads', label: 'Uploads', icon: UploadCloud, testId: 'nav-uploads' },
  { href: '/competitors', label: 'Competitor Intel', icon: Radar, testId: 'nav-competitors' },
] as const;

export function AppSidebar(): JSX.Element {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-none">RFP Pulse</span>
          <span className="text-xs text-muted-foreground">
            {session?.user?.tenantSlug ? `Tenant: ${session.user.tenantSlug}` : ''}
          </span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-testid={item.testId}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t px-3 py-3">
        {session?.user && (
          <div className="flex flex-col gap-2">
            <div className="px-2 text-xs">
              <div className="font-medium text-foreground">{session.user.email}</div>
              <div className="text-muted-foreground">{session.user.role}</div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
