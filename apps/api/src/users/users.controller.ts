import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { hash } from 'bcryptjs';

import { Role } from '@rfp-pulse/db';

import { generateTempPassword } from '../admin/password.util';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  passwordMustChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InviteUserResult {
  user: UserSummary;
  /** One-time temporary password. Shown once to the inviting ADMIN. */
  tempPassword: string;
}

/**
 * Trimmed-down user shape returned from the `assignable` lookup used by the
 * RFP "Assign to" dropdown. Deliberately omits password metadata so the
 * endpoint is safe to call from any upload-capable role.
 */
export interface AssignableUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Tenant-scoped user management. ADMINs manage users within their own tenant;
 * role changes are limited to non-SUPER_ADMIN roles (SUPER_ADMIN is
 * provisioned out-of-band via seed / DB).
 */
@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ users: UserSummary[] }> {
    const users = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return { users: users.map(toSummary) };
  }

  /**
   * Lightweight lookup for the RFP "assign to" dropdown. Any upload-capable
   * role (ADMIN, RFP_MANAGER) can enumerate tenant users, optionally filtered
   * by a single role. Returns only id/email/name/role — no password metadata.
   */
  @Get('assignable')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  async listAssignable(
    @CurrentUser() user: AuthenticatedUser,
    @Query('role') roleQuery?: string,
  ): Promise<{ users: AssignableUserSummary[] }> {
    const role = parseAssignableRole(roleQuery);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        ...(role ? { role } : {}),
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, email: true, name: true, role: true },
    });
    return { users };
  }

  /** ADMIN invites a new user to their tenant; returns a one-time temp password. */
  @Post()
  @Roles(Role.ADMIN)
  async invite(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: { email?: string; name?: string; role?: string },
  ): Promise<InviteUserResult> {
    const email = (body.email ?? '').trim().toLowerCase();
    const name = (body.name ?? '').trim() || null;
    if (!email.includes('@')) {
      throw new BadRequestException('email must be a valid email address');
    }
    const role = parseInvitableRole(body.role);

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: actor.tenantId, email } },
    });
    if (existing) throw new ConflictException(`User ${email} already exists in this tenant`);

    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, BCRYPT_ROUNDS);

    const created = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email,
        name,
        role,
        passwordHash,
        passwordMustChange: true,
      },
    });

    return { user: toSummary(created), tempPassword };
  }

  /** ADMIN updates a user's role (within the same tenant). */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async updateRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { role?: string },
  ): Promise<UserSummary> {
    const role = parseInvitableRole(body.role);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found`);
    if (target.tenantId !== actor.tenantId) {
      throw new ForbiddenException('User belongs to a different tenant');
    }
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify a SUPER_ADMIN user');
    }
    if (target.id === actor.id) {
      throw new BadRequestException('Cannot change your own role');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { role } });
    return toSummary(updated);
  }

  /** ADMIN rotates a user's temp password (e.g. they lost it). Returns new temp password. */
  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InviteUserResult> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found`);
    if (target.tenantId !== actor.tenantId) {
      throw new ForbiddenException('User belongs to a different tenant');
    }
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot reset a SUPER_ADMIN password');
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, passwordMustChange: true },
    });
    return { user: toSummary(updated), tempPassword };
  }
}

function toSummary(u: {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  passwordMustChange: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserSummary {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    passwordMustChange: u.passwordMustChange,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

const INVITABLE_ROLES: Role[] = [
  Role.ADMIN,
  Role.RFP_MANAGER,
  Role.SME,
  Role.REVIEWER,
  Role.APPROVER,
  Role.READ_ONLY,
];

function parseInvitableRole(value: string | undefined): Role {
  if (!value) {
    throw new BadRequestException(`role is required. One of: ${INVITABLE_ROLES.join(', ')}`);
  }
  const upper = value.toUpperCase();
  if (!INVITABLE_ROLES.includes(upper as Role)) {
    throw new BadRequestException(
      `role must be one of: ${INVITABLE_ROLES.join(', ')} (SUPER_ADMIN is not invitable)`,
    );
  }
  return upper as Role;
}

/** Roles that may own an RFP assignment. SUPER_ADMIN is excluded. */
export const ASSIGNABLE_ROLES: Role[] = [
  Role.ADMIN,
  Role.RFP_MANAGER,
  Role.SME,
  Role.REVIEWER,
  Role.APPROVER,
  Role.READ_ONLY,
];

function parseAssignableRole(value: string | undefined): Role | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (!ASSIGNABLE_ROLES.includes(upper as Role)) {
    throw new BadRequestException(`role filter must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
  }
  return upper as Role;
}
