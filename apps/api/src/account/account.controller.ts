import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export interface AccountStatus {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
  passwordMustChange: boolean;
}

/**
 * Self-service account endpoints. Authenticated; any role. Users with
 * `passwordMustChange = true` (e.g. after an admin invite) change their
 * temp password via POST /api/account/change-password, which clears the
 * flag and persists a fresh bcrypt hash.
 */
@Controller('api/account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AccountStatus> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      tenantId: row.tenantId,
      passwordMustChange: row.passwordMustChange,
    };
  }

  /** Update the caller's own profile fields. Currently supports `name`. */
  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name?: string | null },
  ): Promise<AccountStatus> {
    if (body.name === undefined) {
      throw new BadRequestException('no updatable fields provided');
    }
    let name: string | null;
    if (body.name === null) {
      name = null;
    } else if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      name = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new BadRequestException('name must be a string or null');
    }
    const row = await this.prisma.user.update({ where: { id: user.id }, data: { name } });
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      tenantId: row.tenantId,
      passwordMustChange: row.passwordMustChange,
    };
  }

  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ): Promise<{ ok: true; passwordMustChange: false }> {
    const currentPassword = body.currentPassword ?? '';
    const newPassword = body.newPassword ?? '';
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('newPassword must differ from currentPassword');
    }
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!row.passwordHash) {
      throw new UnauthorizedException('Account has no password set');
    }
    const ok = await compare(currentPassword, row.passwordHash);
    if (!ok) throw new UnauthorizedException('currentPassword is incorrect');

    const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordMustChange: false },
    });
    return { ok: true, passwordMustChange: false };
  }
}
