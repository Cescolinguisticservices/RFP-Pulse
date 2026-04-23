import type { RFPStatus } from '@rfp-pulse/db';

import type { BadgeProps } from '@/components/ui/badge';

export const RFP_STATUSES: RFPStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'UNDER_REVIEW',
  'APPROVED',
  'SUBMITTED',
  'WON',
  'LOST',
  'CANCELLED',
];

const LABELS: Record<RFPStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  SUBMITTED: 'Submitted',
  WON: 'Won',
  LOST: 'Lost',
  CANCELLED: 'Cancelled',
};

const VARIANTS: Record<RFPStatus, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'muted',
  IN_PROGRESS: 'warning',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  SUBMITTED: 'default',
  WON: 'success',
  LOST: 'destructive',
  CANCELLED: 'muted',
};

export function rfpStatusLabel(status: RFPStatus): string {
  return LABELS[status] ?? status;
}

export function rfpStatusVariant(status: RFPStatus): NonNullable<BadgeProps['variant']> {
  return VARIANTS[status] ?? 'muted';
}
