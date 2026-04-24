'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { RFPStatus } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { rfpStatusLabel } from '@/lib/rfp-status';

import type { ProposalListRow } from './proposal-list';

type ProposalStatus = Extract<RFPStatus, 'SUBMITTED' | 'WON' | 'LOST'>;

const PROPOSAL_STATUSES: ProposalStatus[] = ['SUBMITTED', 'WON', 'LOST'];

export function ProposalEditDialog({
  row,
  apiBase,
  accessToken,
  onClose,
  onSaved,
}: {
  row: ProposalListRow;
  apiBase: string;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [proposalName, setProposalName] = useState(row.proposalName);
  const [rfpName, setRfpName] = useState(row.rfpName);
  const [clientName, setClientName] = useState(row.clientName ?? '');
  const [submissionDate, setSubmissionDate] = useState(toDateInput(row.submittedAt));
  const [status, setStatus] = useState<ProposalStatus>(row.status);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namesLocked = row.isSystemGenerated;
  const statusLocked = false;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(): Promise<void> {
    if (!namesLocked) {
      const trimmedProposal = proposalName.trim();
      const trimmedRfp = rfpName.trim();
      if (!trimmedProposal) {
        setError('Proposal Name is required');
        return;
      }
      if (!trimmedRfp) {
        setError('RFP Name is required');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        status,
        dueDate: submissionDate || null,
      };

      // For non-system proposals, allow edits to flow back to the project.
      if (!namesLocked) {
        payload.title = rfpName.trim();
        payload.clientName = clientName.trim() || null;
      }

      const res = await fetch(`${apiBase}/api/projects/${row.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Update failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="proposal-edit-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-edit-title"
        className="w-full max-w-lg rounded-md border bg-card p-6 shadow-lg"
        data-testid="proposal-edit-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="proposal-edit-title" className="text-lg font-semibold">
            Edit Proposal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="proposal-edit-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Proposal Name" required>
            <input
              type="text"
              value={proposalName}
              onChange={(e) => setProposalName(e.target.value)}
              disabled={namesLocked}
              required
              data-testid="proposal-edit-name-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Field>

          <Field label="RFP Name" required>
            <input
              type="text"
              value={rfpName}
              onChange={(e) => setRfpName(e.target.value)}
              disabled={namesLocked}
              required
              data-testid="proposal-edit-rfp-name-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Field>

          <Field label="Client Name">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={namesLocked}
              data-testid="proposal-edit-client-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of submission">
              <input
                type="date"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
                data-testid="proposal-edit-submission-input"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProposalStatus)}
                disabled={statusLocked}
                data-testid="proposal-edit-status-input"
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

          {namesLocked && (
            <p className="text-xs text-muted-foreground" data-testid="proposal-edit-system-note">
              This proposal is system-generated. Proposal Name, RFP Name, and Client Name come
              from the linked RFP and cannot be edited here.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive" data-testid="proposal-edit-error">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              data-testid="proposal-edit-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="proposal-edit-save">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </div>
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

function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
