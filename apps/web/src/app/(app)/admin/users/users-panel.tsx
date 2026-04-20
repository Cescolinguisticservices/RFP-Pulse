'use client';

import { KeyRound, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { Role } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  passwordMustChange: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InviteResult {
  user: UserSummary;
  tempPassword: string;
}

const INVITABLE_ROLES: Role[] = [
  Role.ADMIN,
  Role.RFP_MANAGER,
  Role.SME,
  Role.REVIEWER,
  Role.APPROVER,
  Role.READ_ONLY,
];

export function UsersPanel({
  initialUsers,
  initialError,
  accessToken,
  apiBase,
  currentUserId,
}: {
  initialUsers: UserSummary[];
  initialError: string | null;
  accessToken: string;
  apiBase: string;
  currentUserId: string;
}): JSX.Element {
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [error, setError] = useState<string | null>(initialError);
  const [lastCreds, setLastCreds] = useState<InviteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: Role.SME as Role });

  async function invite(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const result = (await res.json()) as InviteResult;
      setLastCreds(result);
      setUsers((prev) => [...prev, result.user]);
      setForm({ email: '', name: '', role: Role.SME });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(userId: string, role: Role): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const updated = (await res.json()) as UserSummary;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  async function resetPassword(userId: string): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const result = (await res.json()) as InviteResult;
      setLastCreds(result);
      setUsers((prev) => prev.map((u) => (u.id === result.user.id ? result.user : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card data-testid="invite-user-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Invite user
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              Email
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="invite-email-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Name (optional)
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="invite-name-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Role
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                data-testid="invite-role-select"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end md:col-span-4">
              <Button type="submit" disabled={busy} data-testid="invite-submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {busy ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
          </form>
          {error && (
            <p className="mt-3 text-xs text-destructive" data-testid="users-error">
              {error}
            </p>
          )}
          {lastCreds && (
            <div
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs"
              data-testid="invite-temp-password"
            >
              <p className="font-medium text-amber-900">
                One-time password — share with {lastCreds.user.email}:
              </p>
              <p className="mt-1 font-mono text-sm font-bold">{lastCreds.tempPassword}</p>
              <p className="mt-1 text-amber-900">
                Shown once. The user will be prompted to set a new password on first login.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant users</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table data-testid="users-table">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Password</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.name ?? '—'}</TableCell>
                  <TableCell>
                    {u.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">{u.role} (you)</span>
                    ) : (
                      <Select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value as Role)}
                        data-testid={`role-select-${u.id}`}
                        className="h-8 w-[10rem] text-xs"
                      >
                        {INVITABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.passwordMustChange ? 'Must change on next login' : 'Set'}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== currentUserId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => resetPassword(u.id)}
                        data-testid={`reset-password-${u.id}`}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Reset password
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
