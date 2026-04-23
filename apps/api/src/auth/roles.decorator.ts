import { SetMetadata } from '@nestjs/common';

import type { Role } from '@rfp-pulse/db';

export const ROLES_METADATA_KEY = 'rfp-pulse:roles';

/** Attach required roles to a route handler; enforced by RolesGuard. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
