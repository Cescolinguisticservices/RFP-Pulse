'use client';

import { Loader2, Save } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

import type { Role } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { roleLabel } from '@/lib/roles';

export function ProfilePanel({
  accessToken,
  apiBase,
  initialName,
  email,
  tenantSlug,
  roleKey,
}: {
  accessToken: string;
  apiBase: string;
  initialName: string;
  email: string;
  tenantSlug: string;
  roleKey: Role;
}): JSX.Element {
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submitName(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setNameBusy(true);
    setNameMsg(null);
    try {
      const trimmed = name.trim();
      const res = await fetch(`${apiBase}/api/account/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: trimmed.length === 0 ? null : trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setNameMsg({ kind: 'ok', text: 'Name updated.' });
      await update();
    } catch (e) {
      setNameMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setNameBusy(false);
    }
  }

  async function submitPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    try {
      if (newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters.');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirmation do not match.');
      }
      const res = await fetch(`${apiBase}/api/account/change-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setPwMsg({ kind: 'ok', text: 'Password changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPwMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={submitName} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                data-testid="profile-name-input"
              />
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={nameBusy} data-testid="profile-name-save">
                {nameBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {nameBusy ? 'Saving…' : 'Save name'}
              </Button>
              {nameMsg && (
                <p
                  className={
                    nameMsg.kind === 'ok'
                      ? 'text-xs text-emerald-700'
                      : 'text-xs text-destructive'
                  }
                  data-testid="profile-name-msg"
                >
                  {nameMsg.text}
                </p>
              )}
            </div>
          </form>

          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="col-span-2">{email}</dd>
            <dt className="text-muted-foreground">Tenant</dt>
            <dd className="col-span-2">{tenantSlug}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="col-span-2">{roleLabel(roleKey)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitPassword} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Current password
              <Input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                data-testid="profile-current-password"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              New password
              <Input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="profile-new-password"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Confirm new password
              <Input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="profile-confirm-password"
              />
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pwBusy} data-testid="profile-password-save">
                {pwBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {pwBusy ? 'Saving…' : 'Change password'}
              </Button>
              {pwMsg && (
                <p
                  className={
                    pwMsg.kind === 'ok' ? 'text-xs text-emerald-700' : 'text-xs text-destructive'
                  }
                  data-testid="profile-password-msg"
                >
                  {pwMsg.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
