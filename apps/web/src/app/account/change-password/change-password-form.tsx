'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiBaseUrl } from '@/lib/api-url';

export function ChangePasswordForm({ forced }: { forced: boolean }): JSX.Element {
  const { update } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const session = await fetch('/api/auth/session').then((r) => r.json());
      const accessToken = session?.accessToken as string | undefined;
      if (!accessToken) throw new Error('Not authenticated');
      const res = await fetch(`${apiBaseUrl()}/api/account/change-password`, {
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
      // Refresh session so passwordMustChange flips to false.
      await update();
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="change-password-form">
      <label className="flex flex-col gap-1 text-sm">
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoFocus
          data-testid="current-password-input"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        New password (min 8 chars)
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          data-testid="new-password-input"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          data-testid="confirm-password-input"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {error && (
        <p className="text-sm text-destructive" data-testid="change-password-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} data-testid="change-password-submit">
        {busy ? 'Updating…' : 'Update password'}
      </Button>
      {!forced && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/dashboard')}
          disabled={busy}
        >
          Cancel
        </Button>
      )}
      {forced && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          disabled={busy}
        >
          Sign out
        </Button>
      )}
    </form>
  );
}
