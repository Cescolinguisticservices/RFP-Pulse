'use client';

import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Radar,
  Settings,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Role } from '@rfp-pulse/db';

import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  testId: string;
  /** Roles allowed to see this nav item. Undefined = all. */
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'RFP', icon: LayoutDashboard, testId: 'nav-dashboard' },
  { href: '/proposals', label: 'Proposals', icon: FileText, testId: 'nav-proposals' },
  { href: '/tasks', label: 'My Tasks', icon: ClipboardList, testId: 'nav-tasks' },
  { href: '/competitors', label: 'Competitor Intel', icon: Radar, testId: 'nav-competitors' },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: '/admin/tenants',
    label: 'Tenants',
    icon: Building2,
    testId: 'nav-admin-tenants',
    roles: [Role.SUPER_ADMIN],
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: Users,
    testId: 'nav-admin-users',
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: Settings,
    testId: 'nav-admin-settings',
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
];

export function AppSidebar(): JSX.Element {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto">
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
          {NAV_ITEMS.map((item) => renderNav(item, pathname))}
        </ul>
        {session?.user && visibleAdminItems(session.user.role).length > 0 && (
          <div className="mt-6">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Admin
            </div>
            <ul className="flex flex-col gap-1">
              {visibleAdminItems(session.user.role).map((item) => renderNav(item, pathname))}
            </ul>
          </div>
        )}
      </nav>
      <div className="border-t px-3 py-3">
        {session?.user && (
          <div className="flex flex-col gap-2">
            <Link
              href="/profile"
              data-testid="nav-profile"
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-2 text-xs transition-colors',
                pathname === '/profile'
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <UserCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {session.user.name ?? session.user.email}
                </span>
                <span className="truncate text-muted-foreground">
                  {roleLabel(session.user.role as Role)}
                </span>
              </div>
            </Link>
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

function visibleAdminItems(role: Role): NavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

function renderNav(item: NavItem, pathname: string | null): JSX.Element {
  const active = pathname?.startsWith(item.href) ?? false;
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
}
