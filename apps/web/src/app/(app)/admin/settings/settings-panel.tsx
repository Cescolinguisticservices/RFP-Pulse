'use client';

import { Loader2, Save } from 'lucide-react';
import { useState } from 'react';

import { LLMProvider } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  defaultProvider: LLMProvider;
  createdAt: string;
}

const PROVIDERS: LLMProvider[] = ['OPENAI', 'GEMINI', 'CLAUDE', 'LLAMA'] as LLMProvider[];

export function SettingsPanel({
  tenant: initialTenant,
  accessToken,
  apiBase,
}: {
  tenant: TenantSummary;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const [tenant, setTenant] = useState<TenantSummary>(initialTenant);
  const [defaultProvider, setDefaultProvider] = useState<LLMProvider>(initialTenant.defaultProvider);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(`${apiBase}/api/tenants/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ defaultProvider }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      const updated = (await res.json()) as TenantSummary;
      setTenant(updated);
      setDefaultProvider(updated.defaultProvider);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="settings-card">
      <CardHeader>
        <CardTitle className="text-base">{tenant.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Default LLM provider
            <Select
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.target.value as LLMProvider)}
              data-testid="settings-provider-select"
              className="max-w-xs"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted-foreground">
              Used by the RAG Draft Response pipeline when generating new answers for this tenant.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={busy || defaultProvider === tenant.defaultProvider}
              data-testid="settings-save"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {savedAt && (
              <span className="text-xs text-muted-foreground" data-testid="settings-saved-at">
                Saved at {savedAt}
              </span>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive" data-testid="settings-error">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
