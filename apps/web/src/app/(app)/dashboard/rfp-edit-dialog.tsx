'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { RFPStatus, Role } from '@rfp-pulse/db';

import { Button } from '@/components/ui/button';
import { RFP_STATUSES, rfpStatusLabel } from '@/lib/rfp-status';

import type { RfpListRow } from './rfp-list';

interface AssignableUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

const ASSIGNABLE_ROLES: Role[] = ['RFP_MANAGER', 'SME', 'REVIEWER', 'APPROVER', 'ADMIN'] as Role[];

export function RfpEditDialog({
  row,
  apiBase,
  accessToken,
  onClose,
  onSaved,
}: {
  row: RfpListRow;
  apiBase: string;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [title, setTitle] = useState(row.title);
  const [clientName, setClientName] = useState(row.clientName ?? '');
  const [dueDate, setDueDate] = useState(row.dueAt ? row.dueAt.slice(0, 10) : '');
  const [status, setStatus] = useState<RFPStatus>(row.status);

  const [assigneeRole, setAssigneeRole] = useState<Role | ''>('');
  const [assigneeId, setAssigneeId] = useState<string>(row.assignee?.id ?? '');

  const [createdById, setCreatedById] = useState<string>(row.createdBy?.id ?? '');

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load all tenant users once; the "Assignee Role" select just filters this
  // list client-side. "Added By" is never filtered.
  useEffect(() => {
    const controller = new AbortController();
    setUsersLoading(true);
    fetch(`${apiBase}/api/users/assignable`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
        const body = (await res.json()) as { users: AssignableUser[] };
        setUsers(body.users);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsersLoading(false);
      });
    return () => controller.abort();
  }, [apiBase, accessToken]);

  const assigneeOptions = useMemo(() => {
    const pool = assigneeRole ? users.filter((u) => u.role === assigneeRole) : users;
    // Always keep the currently-assigned user visible, even when outside filter.
    if (row.assignee && !pool.some((u) => u.id === row.assignee!.id)) {
      const fromList = users.find((u) => u.id === row.assignee!.id);
      if (fromList) return [fromList, ...pool];
    }
    return pool;
  }, [users, assigneeRole, row.assignee]);

  async function save(): Promise<void> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('RFP Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        clientName: clientName.trim() || null,
        dueDate: dueDate || null,
        status,
        assigneeId: assigneeId || null,
        createdById: createdById || null,
      };
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
          `Update failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
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
      data-testid="rfp-edit-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rfp-edit-title"
        className="w-full max-w-lg rounded-md border bg-card p-6 shadow-lg"
        data-testid="rfp-edit-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="rfp-edit-title" className="text-lg font-semibold">
            Edit RFP
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="rfp-edit-close"
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
          <Field label="RFP Name" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              data-testid="rfp-edit-title-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </Field>
          <Field label="Client Name">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              data-testid="rfp-edit-client-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due Date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="rfp-edit-due-input"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RFPStatus)}
                data-testid="rfp-edit-status-input"
                className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {RFP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {rfpStatusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Added By">
            <select
              value={createdById}
              onChange={(e) => setCreatedById(e.target.value)}
              data-testid="rfp-edit-createdby-input"
              className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              disabled={usersLoading}
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name ?? u.email) + ` (${u.role})`}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignee Role">
              <select
                value={assigneeRole}
                onChange={(e) => {
                  const next = e.target.value as Role | '';
                  setAssigneeRole(next);
                  if (next && assigneeId) {
                    const u = users.find((x) => x.id === assigneeId);
                    if (u && u.role !== next) setAssigneeId('');
                  }
                }}
                data-testid="rfp-edit-assignee-role"
                className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="">— Any role —</option>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned To">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                data-testid="rfp-edit-assignee-input"
                className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                disabled={usersLoading}
              >
                <option value="">— Unassigned —</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {(u.name ?? u.email) + ` (${u.role})`}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && (
            <p className="text-xs text-destructive" data-testid="rfp-edit-error">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              data-testid="rfp-edit-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="rfp-edit-save">
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
