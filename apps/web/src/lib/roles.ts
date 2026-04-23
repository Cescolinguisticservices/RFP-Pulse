import type { Role } from '@rfp-pulse/db';

/**
 * Human-friendly labels for the tenant-scoped roles that can own RFP
 * assignments. Keep in sync with `ASSIGNABLE_ROLES` on the API side.
 */
export const ASSIGNABLE_ROLES = [
  'RFP_MANAGER',
  'SME',
  'REVIEWER',
  'APPROVER',
  'ADMIN',
  'READ_ONLY',
] as const satisfies readonly Role[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  RFP_MANAGER: 'RFP Manager',
  SME: 'Subject-Matter Expert',
  REVIEWER: 'Reviewer',
  APPROVER: 'Approver',
  READ_ONLY: 'Read Only',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}
