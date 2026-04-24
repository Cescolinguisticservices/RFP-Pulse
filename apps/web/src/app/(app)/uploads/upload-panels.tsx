'use client';

import { FileText, Loader2, Radar, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ASSIGNABLE_ROLES, type AssignableRole, roleLabel } from '@/lib/roles';

interface UploadResponse {
  projectId: string;
}

interface ProposalUploadSummary {
  uploaded: Array<{ projectId: string; title: string }>;
  failed: Array<{ filename: string; reason: string }>;
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
  const proposalsInputRef = useRef<HTMLInputElement>(null);
  const [rfpFiles, setRfpFiles] = useState<File[]>([]);
  const [proposalFiles, setProposalFiles] = useState<File[]>([]);
  const [rfpName, setRfpName] = useState('');
  const [clientName, setClientName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [useUploadedRfpsForProposal, setUseUploadedRfpsForProposal] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [role, setRole] = useState<AssignableRole | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [referenceOptions, setReferenceOptions] = useState<ProjectOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [referenceProjectIds, setReferenceProjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [proposalSummary, setProposalSummary] = useState<ProposalUploadSummary | null>(null);

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

  const canSubmit = rfpFiles.length > 0 && rfpName.trim().length > 0 && dueDate.length > 0 && !busy;

  useEffect(() => {
    if (!useUploadedRfpsForProposal) return;
    setReferenceProjectIds([]);
    setProposalFiles([]);
    setProposalSummary(null);
    if (proposalsInputRef.current) proposalsInputRef.current.value = '';
  }, [useUploadedRfpsForProposal]);

  function resetRfpForm(): void {
    setRfpFiles([]);
    setProposalFiles([]);
    setProposalSummary(null);
    setRfpName('');
    setClientName('');
    setDueDate('');
    setRole('');
    setAssigneeId('');
    setReferenceProjectIds([]);
    setUseUploadedRfpsForProposal(false);
    setAiInstructions('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    if (proposalsInputRef.current) proposalsInputRef.current.value = '';
  }

  async function saveRfp(): Promise<void> {
    if (rfpFiles.length === 0) return;
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      let projectId: string | null = null;
      for (let i = 0; i < rfpFiles.length; i += 1) {
        const form = new FormData();
        form.append('file', rfpFiles[i]);
        if (projectId) {
          form.append('projectId', projectId);
        } else {
          form.append('rfpName', rfpName.trim());
          if (clientName.trim()) form.append('clientName', clientName.trim());
          if (dueDate) form.append('dueDate', dueDate);
          if (assigneeId) form.append('assigneeId', assigneeId);
          if (!useUploadedRfpsForProposal && referenceProjectIds.length > 0) {
            form.append('referenceProjectIds', JSON.stringify(referenceProjectIds));
          }
          form.append(
            'useUploadedRfpsToGenerateProposal',
            useUploadedRfpsForProposal ? 'true' : 'false',
          );
          if (aiInstructions.trim()) {
            form.append('aiInstructions', aiInstructions.trim());
          }
        }

        const res = await fetch(`${apiBase}/api/upload-rfp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `Upload failed for ${rfpFiles[i].name}: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`,
          );
        }
        const body = (await res.json()) as UploadResponse;
        if (!projectId) projectId = body.projectId;
      }
      resetRfpForm();
      setSavedMessage(`RFP saved with ${rfpFiles.length} file${rfpFiles.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const canUploadProposals =
    !useUploadedRfpsForProposal && !proposalBusy && proposalFiles.length > 0;

  async function uploadProposals(): Promise<void> {
    if (!canUploadProposals) return;
    setProposalBusy(true);
    setError(null);
    setProposalSummary(null);

    const uploaded: Array<{ projectId: string; title: string }> = [];
    const failed: Array<{ filename: string; reason: string }> = [];
    const submissionDate = new Date().toISOString().slice(0, 10);

    for (const proposalFile of proposalFiles) {
      const proposalTitle = filenameToTitle(proposalFile.name);
      try {
        const form = new FormData();
        form.append('file', proposalFile);
        form.append('rfpName', proposalTitle);
        if (clientName.trim()) form.append('clientName', clientName.trim());
        form.append('dueDate', submissionDate);

        const uploadRes = await fetch(`${apiBase}/api/upload-rfp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.text();
          throw new Error(
            `Upload failed: ${uploadRes.status} ${uploadRes.statusText}${body ? ` - ${body}` : ''}`,
          );
        }
        const uploadBody = (await uploadRes.json()) as UploadResponse;

        const patchRes = await fetch(`${apiBase}/api/projects/${uploadBody.projectId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: 'SUBMITTED',
            dueDate: submissionDate,
          }),
        });
        if (!patchRes.ok) {
          const body = await patchRes.text();
          throw new Error(
            `Status update failed: ${patchRes.status} ${patchRes.statusText}${body ? ` - ${body}` : ''}`,
          );
        }

        uploaded.push({ projectId: uploadBody.projectId, title: proposalTitle });
      } catch (e) {
        failed.push({
          filename: proposalFile.name,
          reason: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    if (uploaded.length > 0) {
      setReferenceOptions((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const additions: ProjectOption[] = uploaded
          .filter((item) => !existingIds.has(item.projectId))
          .map((item) => ({
            id: item.projectId,
            title: item.title,
            clientName: clientName.trim() || null,
            status: 'SUBMITTED',
          }));
        return [...additions, ...prev];
      });
    }

    setProposalSummary({ uploaded, failed });
    setProposalFiles([]);
    if (proposalsInputRef.current) proposalsInputRef.current.value = '';
    setProposalBusy(false);
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
            placeholder="City of Acme - IT modernization"
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
              <option value="">-</option>
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
                    ? 'Loading...'
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

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          multiple
          onChange={(e) => setRfpFiles(Array.from(e.target.files ?? []))}
          data-testid="rfp-file-input"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Reference proposals for AI answers
          </span>
          <div
            className={`max-h-40 overflow-y-auto rounded-md border border-input bg-background p-2 ${
              useUploadedRfpsForProposal ? 'opacity-60' : ''
            }`}
          >
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
                        disabled={useUploadedRfpsForProposal}
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
          ref={proposalsInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          multiple
          disabled={useUploadedRfpsForProposal}
          onChange={(e) => setProposalFiles(Array.from(e.target.files ?? []))}
          data-testid="proposal-multi-file-input"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        />

        <Button
          type="button"
          onClick={() => void uploadProposals()}
          disabled={!canUploadProposals}
          data-testid="proposal-multi-upload-button"
          className="self-start"
        >
          {proposalBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          {proposalBusy ? 'Uploading...' : 'Upload Proposals'}
        </Button>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={useUploadedRfpsForProposal}
            onChange={(e) => setUseUploadedRfpsForProposal(e.target.checked)}
            data-testid="rfp-use-uploaded-rfps-checkbox"
          />
          Use uploaded Proposals to generate a proposal for the RFP
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">AI instructions</span>
          <textarea
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
            rows={4}
            data-testid="rfp-ai-instructions-input"
            placeholder="Add specific instructions for the AI..."
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p className="text-xs text-destructive" data-testid="rfp-upload-error">
            {error}
          </p>
        )}
        {savedMessage && (
          <p className="text-xs text-emerald-700" data-testid="rfp-save-message">
            {savedMessage}
          </p>
        )}

        {proposalSummary && (
          <div
            className="rounded-md border bg-muted/30 p-3 text-xs"
            data-testid="proposal-upload-summary"
          >
            <p className="font-medium">
              Uploaded {proposalSummary.uploaded.length} proposal
              {proposalSummary.uploaded.length === 1 ? '' : 's'}.
            </p>
            {proposalSummary.failed.length > 0 && (
              <p className="mt-1 text-destructive">
                Failed: {proposalSummary.failed.map((item) => item.filename).join(', ')}
              </p>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void saveRfp()}
            disabled={!canSubmit}
            data-testid="rfp-save-button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Saving...' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetRfpForm}
            disabled={busy}
            data-testid="rfp-cancel-button"
          >
            Cancel
          </Button>
        </div>

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
          {busy ? 'Analyzing...' : 'Upload FOIA'}
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

function filenameToTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '').trim();
  return withoutExtension || 'Untitled Proposal';
}
