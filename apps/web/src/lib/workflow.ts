import type { WorkflowState } from '@rfp-pulse/db';

import type { BadgeProps } from '@/components/ui/badge';

const LABELS: Record<WorkflowState, string> = {
  DRAFTING: 'Drafting',
  IN_REVIEW: 'In Review',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const VARIANTS: Record<WorkflowState, NonNullable<BadgeProps['variant']>> = {
  DRAFTING: 'muted',
  IN_REVIEW: 'warning',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
};

export function workflowStateLabel(state: WorkflowState): string {
  return LABELS[state] ?? state;
}

export function workflowStateVariant(state: WorkflowState): NonNullable<BadgeProps['variant']> {
  return VARIANTS[state] ?? 'muted';
}
