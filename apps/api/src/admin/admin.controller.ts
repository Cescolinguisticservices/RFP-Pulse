import { Controller, Get, UseGuards } from '@nestjs/common';

import { Role } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/** Admin-only sanity endpoint used to exercise the RBAC guard in tests. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('ping')
  @Roles(Role.ADMIN)
  ping(@CurrentUser() user: AuthenticatedUser): { ok: true; user: AuthenticatedUser } {
    return { ok: true, user };
  }
}
