'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { RFPStatus, Role, WorkflowState } from '@rfp-pulse/db';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rfpStatusLabel, rfpStatusVariant } from '@/lib/rfp-status';

import type { ProposalListRow } from '../proposal-list';
import { ProposalEditDialog } from '../proposal-edit-dialog';
import { RfpContentViewer } from '../../rfp/[id]/content-viewer';

type ProposalStatus = Extract<RFPStatus, 'SUBMITTED' | 'WON' | 'LOST'>;

interface DetailUserRef {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface ProposalDetailProject {
  id: string;
  title: string;
  clientName: string | null;
  dueAt: string | null;
  status: RFPStatus;
  createdBy: DetailUserRef | null;
  assignee: DetailUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalDetailQuestion {
  id: string;
  questionText: string;
  isSelected: boolean;
  answer: {
    id: string;
    content: string;
    state: WorkflowState;
    updatedAt: string;
  } | null;
}

export interface ProposalDetailResponse {
  project: ProposalDetailProject;
  document: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    docxBase64: string | null;
    pdfBase64: string | null;
    extractedText: string | null;
    extractedHtml: string | null;
  } | null;
  questions: ProposalDetailQuestion[];
}

export function ProposalDetailPanel({
  initial,
  canManage,
  accessToken,
  apiBase,
}: {
  initial: ProposalDetailResponse;
  canManage: boolean;
  accessToken: string;
  apiBase: string;
}): JSX.Element {
  const router = useRouter();
  const [project, setProject] = useState(initial.project);
  const [document, setDocument] = useState(initial.document);
  const [questions, setQuestions] = useState(initial.questions);
  const [editOpen, setEditOpen] = useState(false);

  const proposalName = `${project.title} Proposal`;
  const sections = questions.filter((q) => q.isSelected && q.answer && q.answer.content.trim().length > 0);
  const fallbackSections =
    sections.length > 0
      ? sections
      : questions.filter((q) => q.answer && q.answer.content.trim().length > 0);

  const editRow = useMemo<ProposalListRow>(
    () => ({
      id: project.id,
      title: project.title,
      proposalName,
      rfpName: project.title,
      clientName: project.clientName,
      submittedAt: project.dueAt ?? project.updatedAt,
      status: project.status as ProposalStatus,
      createdAt: project.createdAt,
      dueAt: project.dueAt,
      createdBy: project.createdBy
        ? { id: project.createdBy.id, label: project.createdBy.name ?? project.createdBy.email }
        : null,
      assignee: project.assignee
        ? { id: project.assignee.id, label: project.assignee.name ?? project.assignee.email }
        : null,
      isSystemGenerated: true,
    }),
    [project, proposalName],
  );

  async function refresh(): Promise<void> {
    const res = await fetch(`${apiBase}/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const body = (await res.json()) as ProposalDetailResponse;
    setProject(body.project);
    setDocument(body.document);
    setQuestions(body.questions);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/proposals" className="text-sm text-muted-foreground hover:underline">
          ← Back to Proposals
        </Link>
      </div>

      <Card data-testid="proposal-detail-header">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">{proposalName}</CardTitle>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Edit Proposal"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  data-testid="proposal-detail-edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              View of the generated proposal and its source metadata from the linked RFP.
            </p>
          </div>
          <Badge variant={rfpStatusVariant(project.status)}>{rfpStatusLabel(project.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 pt-0 text-sm md:grid-cols-2">
          <MetaField label="RFP Name" value={project.title} />
          <MetaField label="Client Name" value={project.clientName ?? '-'} />
          <MetaField label="Submission Date" value={formatDate(project.dueAt ?? project.updatedAt)} />
          <MetaField label="Status" value={rfpStatusLabel(project.status)} />
        </CardContent>
      </Card>

      <Card data-testid="proposal-detail-document">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Uploaded Document</CardTitle>
          {document && <span className="text-xs text-muted-foreground">{document.filename}</span>}
        </CardHeader>
        <CardContent>
          <RfpContentViewer
            mimeType={document?.mimeType ?? null}
            docxBase64={document?.docxBase64 ?? null}
            pdfBase64={document?.pdfBase64 ?? null}
            html={document?.extractedHtml ?? null}
            text={document?.extractedText ?? null}
          />
        </CardContent>
      </Card>

      <Card data-testid="proposal-detail-content">
        <CardHeader>
          <CardTitle className="text-base">Proposal Content</CardTitle>
        </CardHeader>
        <CardContent>
          {fallbackSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No generated proposal content is available for this record yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {fallbackSections.map((q, index) => (
                <section key={q.id} className="space-y-2">
                  <h3 className="text-sm font-semibold">{`Section ${index + 1}: ${q.questionText}`}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {q.answer?.content ?? ''}
                  </p>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <ProposalEditDialog
          row={editRow}
          apiBase={apiBase}
          accessToken={accessToken}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
