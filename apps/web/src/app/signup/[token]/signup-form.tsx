'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiBaseUrl } from '@/lib/api-url';

interface InviteStatus {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'used';
  intendedEmail: string | null;
  intendedCompany: string | null;
  expiresAt: string | null;
}

export function SignupForm({ token }: { token: string }): JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    slug: '',
    adminEmail: '',
    adminName: '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl()}/api/tenant-invites/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load invite (${res.status})`);
        const body = (await res.json()) as InviteStatus;
        if (cancelled) return;
        setStatus(body);
        setForm((prev) => ({
          ...prev,
          companyName: body.intendedCompany ?? prev.companyName,
          adminEmail: body.intendedEmail ?? prev.adminEmail,
        }));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Unknown error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl()}/api/tenant-invites/${encodeURIComponent(token)}/redeem`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const result = (await res.json()) as { tenant: { slug: string }; admin: { email: string } };
      const signInRes = await signIn('credentials', {
        redirect: false,
        email: result.admin.email,
        password: form.password,
        tenantSlug: result.tenant.slug,
      });
      if (!signInRes || signInRes.error) {
        router.push(
          `/login?tenantSlug=${encodeURIComponent(result.tenant.slug)}&email=${encodeURIComponent(
            result.admin.email,
          )}`,
        );
        return;
      }
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600" data-testid="signup-load-error">
        Could not load invite: {loadError}
      </p>
    );
  }

  if (!status) {
    return <p className="text-sm text-neutral-500">Loading invite…</p>;
  }

  if (!status.valid) {
    const reason =
      status.reason === 'used'
        ? 'This invite link has already been used.'
        : status.reason === 'expired'
          ? 'This invite link has expired.'
          : 'This invite link is invalid.';
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        data-testid="signup-invalid"
      >
        <p className="font-medium">{reason}</p>
        <p className="mt-1">Ask your RFP Pulse contact to generate a new signup link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="signup-form">
      <label className="flex flex-col gap-1 text-sm">
        Company name
        <input
          required
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2"
          data-testid="signup-company-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Workspace slug (lowercase, dashes; used in sign-in)
        <input
          required
          pattern="^[a-z0-9][a-z0-9-]{1,62}$"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
          className="rounded border border-neutral-300 px-3 py-2 font-mono"
          data-testid="signup-slug-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Your email
        <input
          type="email"
          required
          value={form.adminEmail}
          onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2"
          data-testid="signup-email-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Your name (optional)
        <input
          value={form.adminName}
          onChange={(e) => setForm({ ...form, adminName: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2"
          data-testid="signup-name-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password (8+ characters)
        <input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2"
          data-testid="signup-password-input"
        />
      </label>
      {error && (
        <p className="text-sm text-red-600" data-testid="signup-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
        data-testid="signup-submit"
      >
        {busy ? 'Creating workspace…' : 'Create workspace'}
      </button>
    </form>
  );
}
