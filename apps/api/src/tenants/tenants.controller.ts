import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { hash } from 'bcryptjs';

import { LLMProvider, Prisma, Role } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from '../admin/password.util';

const BCRYPT_ROUNDS = 10;

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  defaultProvider: LLMProvider;
  createdAt: string;
}

export interface CreateTenantResult {
  tenant: TenantSummary;
  initialAdmin: { id: string; email: string };
  /** One-time temporary password. Shown once to the SUPER_ADMIN who created the tenant. */
  tempPassword: string;
}

@Controller('api/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /** SUPER_ADMIN provisions a new tenant + its initial ADMIN user. */
  @Post()
  @Roles(Role.SUPER_ADMIN)
  async create(
    @Body()
    body: {
      name?: string;
      slug?: string;
      adminEmail?: string;
      adminName?: string;
      defaultProvider?: string;
    },
  ): Promise<CreateTenantResult> {
    const name = (body.name ?? '').trim();
    const slug = (body.slug ?? '').trim().toLowerCase();
    const adminEmail = (body.adminEmail ?? '').trim().toLowerCase();
    const adminName = (body.adminName ?? '').trim() || null;
    if (!name) throw new BadRequestException('name is required');
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      throw new BadRequestException('slug must be lowercase letters/digits/dashes (2–63 chars)');
    }
    if (!adminEmail.includes('@')) {
      throw new BadRequestException('adminEmail must be a valid email address');
    }
    const defaultProvider = parseProvider(body.defaultProvider) ?? LLMProvider.OPENAI;

    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Tenant slug "${slug}" already exists`);

    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, BCRYPT_ROUNDS);

    let tenant;
    try {
      tenant = await this.prisma.tenant.create({
        data: {
          name,
          slug,
          defaultProvider,
          users: {
            create: {
              email: adminEmail,
              name: adminName,
              role: Role.ADMIN,
              passwordHash,
              passwordMustChange: true,
            },
          },
        },
        include: { users: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Tenant slug "${slug}" already exists`);
      }
      throw err;
    }

    const admin = tenant.users[0];
    return {
      tenant: toTenantSummary(tenant),
      initialAdmin: { id: admin.id, email: admin.email },
      tempPassword,
    };
  }

  /** SUPER_ADMIN lists all tenants. */
  @Get()
  @Roles(Role.SUPER_ADMIN)
  async list(): Promise<{ tenants: TenantSummary[] }> {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
    return { tenants: tenants.map(toTenantSummary) };
  }

  /** ADMIN reads their own tenant settings. */
  @Get('me')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<TenantSummary> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    return toTenantSummary(tenant);
  }

  /** ADMIN updates tenant settings (currently: default LLM provider). */
  @Patch('me')
  @Roles(Role.ADMIN)
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { defaultProvider?: string; name?: string },
  ): Promise<TenantSummary> {
    const data: { defaultProvider?: LLMProvider; name?: string } = {};
    if (body.defaultProvider !== undefined) {
      const parsed = parseProvider(body.defaultProvider);
      if (!parsed) {
        throw new BadRequestException(
          `defaultProvider must be one of: ${Object.values(LLMProvider).join(', ')}`,
        );
      }
      data.defaultProvider = parsed;
    }
    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (trimmed) data.name = trimmed;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No updatable fields supplied');
    }
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data,
    });
    return toTenantSummary(tenant);
  }
}

function toTenantSummary(tenant: {
  id: string;
  name: string;
  slug: string;
  defaultProvider: LLMProvider;
  createdAt: Date;
}): TenantSummary {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    defaultProvider: tenant.defaultProvider,
    createdAt: tenant.createdAt.toISOString(),
  };
}

function parseProvider(value: string | undefined): LLMProvider | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  const all = Object.values(LLMProvider) as string[];
  return all.includes(upper) ? (upper as LLMProvider) : null;
}
