'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { RFPStatus } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RFP_STATUSES, rfpStatusLabel, rfpStatusVariant } from '@/lib/rfp-status';
import { cn } from '@/lib/utils';

import { RfpEditDialog } from './rfp-edit-dialog';

export interface RfpListRowUserRef {
  id: string;
  label: string;
}

export interface RfpListRow {
  id: string;
  title: string;
  clientName: string | null;
  status: RFPStatus;
  createdAt: string;
  dueAt: string | null;
  createdBy: RfpListRowUserRef | null;
  assignee: RfpListRowUserRef | null;
}

type SortKey = 'title' | 'createdAt' | 'createdBy' | 'assignee' | 'dueAt' | 'status';
type SortDir = 'asc' | 'desc';

export function RfpList({
  rows,
  canManage,
  accessToken,
  apiBase,
}: {
  rows: RfpListRow[];
  canManage: boolean;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState('');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<RFPStatus | ''>('');

  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = useMemo(
    () => (editingId ? (rows.find((r) => r.id === editingId) ?? null) : null),
    [editingId, rows],
  );

  const filtered = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    const createdByNeedle = createdByFilter.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return rows.filter((row) => {
      if (needle && !row.title.toLowerCase().includes(needle)) return false;
      if (createdByNeedle) {
        const label = row.createdBy?.label.toLowerCase() ?? '';
        if (!label.includes(createdByNeedle)) return false;
      }
      if (from !== null && new Date(row.createdAt).getTime() < from) return false;
      if (to !== null && new Date(row.createdAt).getTime() > to) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, nameFilter, createdByFilter, dateFrom, dateTo, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'createdAt' || key === 'dueAt' ? 'desc' : 'asc');
    }
  }

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleIds = sorted.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleSelectAllVisible(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function bulkDelete(): Promise<void> {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const confirmed = window.confirm(
      `Delete ${ids.length} RFP${ids.length === 1 ? '' : 's'}? This cascades to all questions, answers, and linked documents.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `DELETE failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
        );
      }
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Link
            href="/uploads"
            className={buttonVariants({ variant: 'default' })}
            data-testid="rfp-create-new"
          >
            <Plus className="h-4 w-4" />
            Create New RFP
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Search by RFP name">
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="City of Acme…"
              data-testid="rfp-filter-name"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Added by">
            <input
              type="text"
              value={createdByFilter}
              onChange={(e) => setCreatedByFilter(e.target.value)}
              placeholder="name or email"
              data-testid="rfp-filter-created-by"
              className="h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Added from">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="rfp-filter-date-from"
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Added to">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="rfp-filter-date-to"
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RFPStatus | '')}
              data-testid="rfp-filter-status"
              className="h-9 w-44 rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              {RFP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {rfpStatusLabel(s)}
                </option>
              ))}
            </select>
          </FilterField>
          {canManage && selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={bulkDelete}
                disabled={deleting}
                data-testid="rfp-bulk-delete"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete {selected.size}
              </Button>
            </div>
          )}
        </div>
        {deleteError && (
          <p className="text-xs text-destructive" data-testid="rfp-delete-error">
            {deleteError}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="pt-0">
          <Table data-testid="rfp-table">
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all visible RFPs"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      data-testid="rfp-select-all"
                    />
                  </TableHead>
                )}
                {canManage && <TableHead className="w-10" />}
                <SortableHead
                  label="RFP Name"
                  active={sortKey === 'title'}
                  dir={sortDir}
                  onClick={() => toggleSort('title')}
                  testId="rfp-sort-title"
                />
                <SortableHead
                  label="Date Added"
                  active={sortKey === 'createdAt'}
                  dir={sortDir}
                  onClick={() => toggleSort('createdAt')}
                  testId="rfp-sort-created"
                />
                <SortableHead
                  label="Added By"
                  active={sortKey === 'createdBy'}
                  dir={sortDir}
                  onClick={() => toggleSort('createdBy')}
                  testId="rfp-sort-created-by"
                />
                <SortableHead
                  label="Assigned To"
                  active={sortKey === 'assignee'}
                  dir={sortDir}
                  onClick={() => toggleSort('assignee')}
                  testId="rfp-sort-assignee"
                />
                <SortableHead
                  label="Due Date"
                  active={sortKey === 'dueAt'}
                  dir={sortDir}
                  onClick={() => toggleSort('dueAt')}
                  testId="rfp-sort-due"
                />
                <SortableHead
                  label="Status"
                  active={sortKey === 'status'}
                  dir={sortDir}
                  onClick={() => toggleSort('status')}
                  testId="rfp-sort-status"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 8 : 6}
                    className="py-8 text-center text-sm text-muted-foreground"
                    data-testid="rfp-empty"
                  >
                    {rows.length === 0
                      ? 'No RFPs yet. Click Create New RFP to upload your first one.'
                      : 'No RFPs match the current filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow key={row.id} data-testid={`rfp-row-${row.id}`}>
                    {canManage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.title}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          data-testid={`rfp-select-${row.id}`}
                        />
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell className="w-10">
                        <button
                          type="button"
                          onClick={() => setEditingId(row.id)}
                          aria-label={`Edit ${row.title}`}
                          title="Edit"
                          data-testid={`rfp-edit-${row.id}`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <Link
                        href={`/rfp/${row.id}`}
                        className="text-foreground hover:underline"
                        data-testid={`rfp-link-${row.id}`}
                      >
                        {row.title}
                      </Link>
                      {row.clientName && (
                        <div className="text-xs text-muted-foreground">{row.clientName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{row.createdBy?.label ?? '—'}</TableCell>
                    <TableCell className="text-sm">{row.assignee?.label ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.dueAt ? formatDate(row.dueAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rfpStatusVariant(row.status)}>
                        {rfpStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingRow && (
        <RfpEditDialog
          row={editingRow}
          apiBase={apiBase}
          accessToken={accessToken}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  testId?: string;
}): JSX.Element {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={cn(
          'flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

function sortValue(row: RfpListRow, key: SortKey): string | number | null {
  switch (key) {
    case 'title':
      return row.title.toLowerCase();
    case 'createdAt':
      return new Date(row.createdAt).getTime();
    case 'createdBy':
      return row.createdBy?.label.toLowerCase() ?? null;
    case 'assignee':
      return row.assignee?.label.toLowerCase() ?? null;
    case 'dueAt':
      return row.dueAt ? new Date(row.dueAt).getTime() : null;
    case 'status':
      return row.status;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
