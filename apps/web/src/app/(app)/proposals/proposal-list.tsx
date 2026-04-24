'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

import type { RFPStatus } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rfpStatusLabel, rfpStatusVariant } from '@/lib/rfp-status';
import { cn } from '@/lib/utils';

import type { RfpListRowUserRef } from '../dashboard/rfp-list';

import { ProposalEditDialog } from './proposal-edit-dialog';

type ProposalStatus = Extract<RFPStatus, 'SUBMITTED' | 'WON' | 'LOST'>;

const PROPOSAL_STATUSES: ProposalStatus[] = ['SUBMITTED', 'WON', 'LOST'];

export interface ProposalListRow {
  id: string;
  title: string;
  proposalName: string;
  rfpName: string;
  clientName: string | null;
  submittedAt: string;
  status: ProposalStatus;
  createdAt: string;
  dueAt: string | null;
  createdBy: RfpListRowUserRef | null;
  assignee: RfpListRowUserRef | null;
  isSystemGenerated: boolean;
}

type SortKey = 'proposalName' | 'rfpName' | 'clientName' | 'submittedAt' | 'status';
type SortDir = 'asc' | 'desc';

export function ProposalList({
  rows,
  canManage,
  accessToken,
  apiBase,
}: {
  rows: ProposalListRow[];
  canManage: boolean;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | ''>('');

  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRow = useMemo<ProposalListRow | null>(() => {
    if (!editingId) return null;
    return rows.find((r) => r.id === editingId) ?? null;
  }, [editingId, rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return rows.filter((row) => {
      if (needle) {
        const hit =
          row.proposalName.toLowerCase().includes(needle) ||
          row.rfpName.toLowerCase().includes(needle) ||
          (row.clientName ?? '').toLowerCase().includes(needle);
        if (!hit) return false;
      }
      if (from !== null && new Date(row.submittedAt).getTime() < from) return false;
      if (to !== null && new Date(row.submittedAt).getTime() > to) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, dateFrom, dateTo, statusFilter]);

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
      setSortDir(key === 'submittedAt' ? 'desc' : 'asc');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Link
            href="/proposals/upload"
            className={buttonVariants({ variant: 'default' })}
            data-testid="proposal-upload-new"
          >
            <UploadCloud className="h-4 w-4" />
            Upload Proposal
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Search">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="proposal, RFP, or client"
              data-testid="proposal-filter-search"
              className="h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Submitted from">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="proposal-filter-date-from"
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Submitted to">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="proposal-filter-date-to"
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </FilterField>
          <FilterField label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProposalStatus | '')}
              data-testid="proposal-filter-status"
              className="h-9 w-44 rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              {PROPOSAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {rfpStatusLabel(s)}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>

      <Card>
        <CardContent className="pt-0">
          <Table data-testid="proposal-table">
            <TableHeader>
              <TableRow>
                {canManage && <TableHead className="w-10" />}
                <SortableHead
                  label="Proposal Name"
                  active={sortKey === 'proposalName'}
                  dir={sortDir}
                  onClick={() => toggleSort('proposalName')}
                  testId="proposal-sort-name"
                />
                <SortableHead
                  label="RFP Name"
                  active={sortKey === 'rfpName'}
                  dir={sortDir}
                  onClick={() => toggleSort('rfpName')}
                  testId="proposal-sort-rfp"
                />
                <SortableHead
                  label="Client Name"
                  active={sortKey === 'clientName'}
                  dir={sortDir}
                  onClick={() => toggleSort('clientName')}
                  testId="proposal-sort-client"
                />
                <SortableHead
                  label="Date of submission"
                  active={sortKey === 'submittedAt'}
                  dir={sortDir}
                  onClick={() => toggleSort('submittedAt')}
                  testId="proposal-sort-date"
                />
                <SortableHead
                  label="Status"
                  active={sortKey === 'status'}
                  dir={sortDir}
                  onClick={() => toggleSort('status')}
                  testId="proposal-sort-status"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="py-8 text-center text-sm text-muted-foreground"
                    data-testid="proposal-empty"
                  >
                    {rows.length === 0
                      ? 'No proposals yet.'
                      : 'No proposals match the current filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow key={row.id} data-testid={`proposal-row-${row.id}`}>
                    {canManage && (
                      <TableCell className="w-10">
                        <button
                          type="button"
                          onClick={() => setEditingId(row.id)}
                          aria-label={`Edit ${row.proposalName}`}
                          title="Edit"
                          data-testid={`proposal-edit-${row.id}`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <Link
                        href={`/proposals/${row.id}`}
                        className="text-foreground hover:underline"
                        data-testid={`proposal-link-${row.id}`}
                      >
                        {row.proposalName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.rfpName}</TableCell>
                    <TableCell>{row.clientName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rfpStatusVariant(row.status)}>{rfpStatusLabel(row.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingRow && (
        <ProposalEditDialog
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

function sortValue(row: ProposalListRow, key: SortKey): string | number | null {
  switch (key) {
    case 'proposalName':
      return row.proposalName.toLowerCase();
    case 'rfpName':
      return row.rfpName.toLowerCase();
    case 'clientName':
      return row.clientName?.toLowerCase() ?? null;
    case 'submittedAt':
      return new Date(row.submittedAt).getTime();
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
