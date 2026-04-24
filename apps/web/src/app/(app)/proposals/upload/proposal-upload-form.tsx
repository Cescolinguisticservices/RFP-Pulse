'use client';

import { Loader2, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import type { RFPStatus } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { rfpStatusLabel } from '@/lib/rfp-status';

type ProposalStatus = Extract<RFPStatus, 'SUBMITTED' | 'WON' | 'LOST'>;

const PROPOSAL_STATUSES: ProposalStatus[] = ['SUBMITTED', 'WON', 'LOST'];

interface UploadResponse {
  projectId: string;
}

export function ProposalUploadForm({
  accessToken,
  apiBase,
}: {
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [proposalName, setProposalName] = useState('');
  const [rfpName, setRfpName] = useState('');
  const [clientName, setClientName] = useState('');
  const [submissionDate, setSubmissionDate] = useState('');
  const [status, setStatus] = useState<ProposalStatus>('SUBMITTED');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const canSubmit =
    !busy &&
    !!file &&
    proposalName.trim().length > 0 &&
    rfpName.trim().length > 0 &&
    submissionDate.length > 0;

  async function submit(): Promise<void> {
    if (!canSubmit || !file) return;
    setBusy(true);
    setError(null);
    setSuccessId(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('rfpName', rfpName.trim());
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
          status,
          dueDate: submissionDate,
        }),
      });
      if (!patchRes.ok) {
        const body = await patchRes.text();
        throw new Error(
          `Status update failed: ${patchRes.status} ${patchRes.statusText}${body ? ` - ${body}` : ''}`,
        );
      }

      setSuccessId(uploadBody.projectId);
      setProposalName('');
      setRfpName('');
      setClientName('');
      setSubmissionDate('');
      setStatus('SUBMITTED');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upload Proposal</h2>
            <Link href="/proposals" className="text-sm text-muted-foreground hover:underline">
              Back to Proposals
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <Field label="Proposal Name" required>
              <input
                type="text"
                value={proposalName}
                onChange={(e) => setProposalName(e.target.value)}
                data-testid="proposal-upload-name-input"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Statewide Digital Services Proposal"
              />
            </Field>

            <Field label="RFP Name" required>
              <input
                type="text"
                value={rfpName}
                onChange={(e) => setRfpName(e.target.value)}
                data-testid="proposal-upload-rfp-input"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Statewide Digital Services"
              />
            </Field>

            <Field label="Client Name">
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                data-testid="proposal-upload-client-input"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="City of Springfield"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of submission" required>
                <input
                  type="date"
                  value={submissionDate}
                  onChange={(e) => setSubmissionDate(e.target.value)}
                  data-testid="proposal-upload-date-input"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </Field>

              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProposalStatus)}
                  data-testid="proposal-upload-status-input"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {PROPOSAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {rfpStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Upload File" required>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="proposal-upload-file-input"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                data-testid="proposal-upload-submit"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {busy ? 'Uploading...' : 'Upload Proposal'}
              </Button>
              {successId && (
                <Link
                  href={`/proposals/${successId}`}
                  className="text-sm text-primary hover:underline"
                  data-testid="proposal-upload-open-link"
                >
                  Open proposal
                </Link>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive" data-testid="proposal-upload-error">
                {error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
