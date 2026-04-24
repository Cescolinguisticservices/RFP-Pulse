'use client';

import { FileText, Loader2, Radar, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ASSIGNABLE_ROLES, type AssignableRole, roleLabel } from '@/lib/roles';

interface RfpUploadResult {
  documentId: string;
  projectId: string;
  rfpName: string;
  clientName: string | null;
  dueAt: string | null;
  assigneeId: string | null;
  status: string;
  filename: string;
  textLength: number;
  indexedChunks: number;
  preview: string;
}

interface FoiaUploadResult {
  documentId: string;
  intelId: string;
  competitorName: string;
  pricingModel: string | null;
  technicalStrategies: string | null;
  winThemes: string | null;
}

interface AssignableUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface ProjectOption {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
}

export function UploadPanels({
  accessToken,
  apiBase,
}: {
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <RfpUploader accessToken={accessToken} apiBase={apiBase} />
      <FoiaUploader accessToken={accessToken} apiBase={apiBase} />
    </div>
  );
}

function RfpUploader({
  accessToken,
  apiBase,
}: {
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rfpName, setRfpName] = useState('');
  const [clientName, setClientName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [role, setRole] = useState<AssignableRole | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [referenceOptions, setReferenceOptions] = useState<ProjectOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [referenceProjectIds, setReferenceProjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RfpUploadResult | null>(null);

  useEffect(() => {
    if (!role) {
      setUsers([]);
      setAssigneeId('');
      return;
    }
    const controller = new AbortController();
    setUsersLoading(true);
    setAssigneeId('');
    fetch(`${apiBase}/api/users/assignable?role=${encodeURIComponent(role)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
        const body = (await res.json()) as { users: AssignableUser[] };
        setUsers(body.users);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setUsers([]);
        setError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsersLoading(false);
      });
    return () => controller.abort();
  }, [role, accessToken, apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    setRefsLoading(true);
    fetch(`${apiBase}/api/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load proposals: ${res.status}`);
        const body = (await res.json()) as {
          projects: Array<{
            id: string;
            title: string;
            clientName: string | null;
            status: string;
          }>;
        };
        const proposals = body.projects.filter((p) =>
          ['SUBMITTED', 'WON', 'LOST'].includes(p.status),
        );
        setReferenceOptions(proposals);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Failed to load proposals');
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefsLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, apiBase]);

  const canSubmit = !!file && rfpName.trim().length > 0 && dueDate.length > 0 && !busy;

  async function upload(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('rfpName', rfpName.trim());
      if (clientName.trim()) form.append('clientName', clientName.trim());
      if (dueDate) form.append('dueDate', dueDate);
      if (assigneeId) form.append('assigneeId', assigneeId);
      if (referenceProjectIds.length > 0) {
        form.append('referenceProjectIds', JSON.stringify(referenceProjectIds));
      }
      const res = await fetch(`${apiBase}/api/upload-rfp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Upload failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
        );
      }
      setResult((await res.json()) as RfpUploadResult);
      setFile(null);
      setRfpName('');
      setClientName('');
      setDueDate('');
      setRole('');
      setAssigneeId('');
      setReferenceProjectIds([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="rfp-uploader">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          RFP document
        </CardTitle>
        <CardDescription>
          PDF, DOCX, XLSX, or TXT. Text is extracted, chunked, and embedded into the tenant
          knowledge base so future drafts retrieve it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">RFP name *</span>
          <input
            type="text"
            value={rfpName}
            onChange={(e) => setRfpName(e.target.value)}
            placeholder="City of Acme — IT modernization"
            data-testid="rfp-name-input"
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Client / issuing agency</span>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="City of Acme"
            data-testid="rfp-client-input"
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Due date *</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="rfp-due-input"
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Assign role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole | '')}
              data-testid="rfp-role-select"
              className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Assign to user</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!role || usersLoading}
              data-testid="rfp-assignee-select"
              className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {!role
                  ? 'Pick a role first'
                  : usersLoading
                    ? 'Loading…'
                    : users.length === 0
                      ? 'No users in this role'
                      : 'Unassigned'}
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} (${u.email})` : u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Reference proposals for AI answers
          </span>
          <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background p-2">
            {refsLoading ? (
              <p className="text-xs text-muted-foreground">Loading proposals...</p>
            ) : referenceOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No proposal records available (Submitted/Won/Lost).
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {referenceOptions.map((opt) => {
                  const checked = referenceProjectIds.includes(opt.id);
                  return (
                    <label key={opt.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setReferenceProjectIds((prev) =>
                            e.target.checked
                              ? [...prev, opt.id]
                              : prev.filter((id) => id !== opt.id),
                          )
                        }
                        data-testid={`rfp-reference-${opt.id}`}
                      />
                      <span className="truncate">
                        {opt.title}
                        {opt.clientName ? ` (${opt.clientName})` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          data-testid="rfp-file-input"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        <Button
          type="button"
          onClick={upload}
          disabled={!canSubmit}
          data-testid="rfp-upload-button"
          className="self-start"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          {busy ? 'Uploading…' : 'Upload RFP'}
        </Button>
        {error && (
          <p className="text-xs text-destructive" data-testid="rfp-upload-error">
            {error}
          </p>
        )}
        {result && (
          <div
            className="rounded-md border bg-muted/30 p-3 text-xs"
            data-testid="rfp-upload-result"
          >
            <p className="font-medium">{result.rfpName}</p>
            <p className="text-muted-foreground">
              {result.filename} · Extracted {result.textLength.toLocaleString()} chars · Indexed{' '}
              {result.indexedChunks} chunk{result.indexedChunks === 1 ? '' : 's'} into the knowledge
              base.
            </p>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              {result.preview}
              {result.preview.length >= 500 ? '…' : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FoiaUploader({
  accessToken,
  apiBase,
}: {
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [competitorName, setCompetitorName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoiaUploadResult | null>(null);

  async function upload(): Promise<void> {
    if (!file || competitorName.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('competitorName', competitorName.trim());
      const res = await fetch(`${apiBase}/api/upload-foia`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }
      setResult((await res.json()) as FoiaUploadResult);
      setFile(null);
      setCompetitorName('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="foia-uploader">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" />
          Competitor / FOIA document
        </CardTitle>
        <CardDescription>
          The LLM extracts pricing models, technical strategies, and win themes into the Competitor
          Intel table.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Competitor name</span>
          <input
            type="text"
            value={competitorName}
            onChange={(e) => setCompetitorName(e.target.value)}
            placeholder="Acme Corp"
            data-testid="foia-competitor-input"
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          data-testid="foia-file-input"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        <Button
          type="button"
          onClick={upload}
          disabled={!file || competitorName.trim().length === 0 || busy}
          data-testid="foia-upload-button"
          className="self-start"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          {busy ? 'Analyzing…' : 'Upload FOIA'}
        </Button>
        {error && (
          <p className="text-xs text-destructive" data-testid="foia-upload-error">
            {error}
          </p>
        )}
        {result && (
          <div
            className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-xs"
            data-testid="foia-upload-result"
          >
            <p className="font-medium">{result.competitorName}</p>
            {result.pricingModel && (
              <p>
                <span className="font-medium">Pricing:</span> {result.pricingModel}
              </p>
            )}
            {result.technicalStrategies && (
              <p>
                <span className="font-medium">Strategies:</span> {result.technicalStrategies}
              </p>
            )}
            {result.winThemes && (
              <p>
                <span className="font-medium">Win themes:</span> {result.winThemes}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
