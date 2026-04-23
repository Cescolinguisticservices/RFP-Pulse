'use client';

import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { LLMProvider } from '@rfp-pulse/db';

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

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  defaultProvider: LLMProvider;
  createdAt: string;
}

interface CreateTenantResult {
  tenant: TenantSummary;
  initialAdmin: { id: string; email: string };
  tempPassword: string;
}

export function TenantsPanel({
  initialTenants,
  initialError,
  accessToken,
  apiBase,
}: {
  initialTenants: TenantSummary[];
  initialError: string | null;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const [tenants, setTenants] = useState<TenantSummary[]>(initialTenants);
  const [error, setError] = useState<string | null>(initialError);
  const [lastCreated, setLastCreated] = useState<CreateTenantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminName: '',
    defaultProvider: 'OPENAI' as LLMProvider,
  });

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/tenants`, {
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
      const result = (await res.json()) as CreateTenantResult;
      setLastCreated(result);
      setTenants((prev) => [result.tenant, ...prev]);
      setForm({
        name: '',
        slug: '',
        adminEmail: '',
        adminName: '',
        defaultProvider: 'OPENAI',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card data-testid="new-tenant-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> New company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Company name
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="tenant-name-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Slug (lowercase, dashes)
              <Input
                required
                pattern="^[a-z0-9][a-z0-9-]{1,62}$"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                data-testid="tenant-slug-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Initial admin email
              <Input
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                data-testid="tenant-admin-email-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Initial admin name (optional)
              <Input
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                data-testid="tenant-admin-name-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Default LLM provider
              <Select
                value={form.defaultProvider}
                onChange={(e) =>
                  setForm({ ...form, defaultProvider: e.target.value as LLMProvider })
                }
                data-testid="tenant-provider-select"
              >
                {(['OPENAI', 'GEMINI', 'CLAUDE', 'LLAMA'] as LLMProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end">
              <Button type="submit" disabled={busy} data-testid="tenant-submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {busy ? 'Creating…' : 'Create tenant'}
              </Button>
            </div>
          </form>
          {error && (
            <p className="mt-3 text-xs text-destructive" data-testid="tenant-error">
              {error}
            </p>
          )}
          {lastCreated && (
            <div
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs"
              data-testid="tenant-temp-password"
            >
              <p className="font-medium text-amber-900">
                Tenant provisioned — share this one-time password with the new admin:
              </p>
              <p className="mt-1 font-mono text-sm">
                {lastCreated.initialAdmin.email}
                {' · '}
                <span className="font-bold">{lastCreated.tempPassword}</span>
              </p>
              <p className="mt-1 text-amber-900">
                It will not be shown again. The admin will be prompted to set a new password on
                first login.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All tenants</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table data-testid="tenants-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Default provider</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id} data-testid={`tenant-row-${t.id}`}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.slug}
                  </TableCell>
                  <TableCell>{t.defaultProvider}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString()}
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
