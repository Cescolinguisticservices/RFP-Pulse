import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

import { LLMProvider, Role } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;
const DEFAULT_TTL_DAYS = 7;
const MIN_PASSWORD_LENGTH = 8;

export interface CreateInviteResult {
  id: string;
  /** One-time token; shown to SUPER_ADMIN exactly once and must be shared out-of-band. */
  token: string;
  /** Relative URL for the signup page. The SUPER_ADMIN shares this with the prospect. */
  signupUrl: string;
  expiresAt: string;
}

export interface InviteStatus {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'used';
  intendedEmail: string | null;
  intendedCompany: string | null;
  expiresAt: string | null;
}

export interface RedeemResult {
  tenant: { id: string; slug: string; name: string };
  admin: { id: string; email: string };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Controller('api/tenant-invites')
export class TenantInvitesController {
  constructor(private readonly prisma: PrismaService) {}

  /** SUPER_ADMIN generates a single-use signup URL. Returns the raw token exactly once. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { intendedEmail?: string; intendedCompany?: string; ttlDays?: number },
  ): Promise<CreateInviteResult> {
    const intendedEmail = (body.intendedEmail ?? '').trim().toLowerCase() || null;
    const intendedCompany = (body.intendedCompany ?? '').trim() || null;
    const ttlDays = Math.min(Math.max(body.ttlDays ?? DEFAULT_TTL_DAYS, 1), 30);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.tenantInvite.create({
      data: {
        tokenHash,
        invitedByUserId: user.id,
        intendedEmail,
        intendedCompany,
        expiresAt,
      },
    });

    return {
      id: invite.id,
      token,
      signupUrl: `/signup/${token}`,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /** Public: validates a signup token without consuming it. Used by the signup page to decide whether to render the form. */
  @Get(':token')
  async status(@Param('token') token: string): Promise<InviteStatus> {
    const invite = await this.prisma.tenantInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) {
      return {
        valid: false,
        reason: 'not_found',
        intendedEmail: null,
        intendedCompany: null,
        expiresAt: null,
      };
    }
    if (invite.usedAt) {
      return {
        valid: false,
        reason: 'used',
        intendedEmail: invite.intendedEmail,
        intendedCompany: invite.intendedCompany,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return {
        valid: false,
        reason: 'expired',
        intendedEmail: invite.intendedEmail,
        intendedCompany: invite.intendedCompany,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }
    return {
      valid: true,
      intendedEmail: invite.intendedEmail,
      intendedCompany: invite.intendedCompany,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /** Public: redeems a signup invite by creating a Tenant + initial ADMIN user. */
  @Post(':token/redeem')
  async redeem(
    @Param('token') token: string,
    @Body()
    body: {
      companyName?: string;
      slug?: string;
      adminEmail?: string;
      adminName?: string;
      password?: string;
    },
  ): Promise<RedeemResult> {
    const companyName = (body.companyName ?? '').trim();
    const slug = (body.slug ?? '').trim().toLowerCase();
    const adminEmail = (body.adminEmail ?? '').trim().toLowerCase();
    const adminName = (body.adminName ?? '').trim() || null;
    const password = body.password ?? '';
    if (!companyName) throw new BadRequestException('companyName is required');
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      throw new BadRequestException('slug must be lowercase letters/digits/dashes (2–63 chars)');
    }
    if (!adminEmail.includes('@')) {
      throw new BadRequestException('adminEmail must be a valid email address');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const tokenHash = hashToken(token);
    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.tenantInvite.findUnique({ where: { tokenHash } });
      if (!invite) throw new BadRequestException('invite not found');
      if (invite.usedAt) throw new BadRequestException('invite has already been used');
      if (invite.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('invite has expired');
      }

      const existing = await tx.tenant.findUnique({ where: { slug } });
      if (existing) throw new ConflictException(`Tenant slug "${slug}" already exists`);

      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
          defaultProvider: LLMProvider.OPENAI,
          users: {
            create: {
              email: adminEmail,
              name: adminName,
              role: Role.ADMIN,
              passwordHash,
              passwordMustChange: false,
            },
          },
        },
        include: { users: true },
      });

      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), redeemedTenantId: tenant.id },
      });

      const admin = tenant.users[0];
      return {
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        admin: { id: admin.id, email: admin.email },
      };
    });
  }
}
