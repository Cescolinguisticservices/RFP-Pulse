import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantInvitesController } from './tenant-invites.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TenantInvitesController],
})
export class TenantInvitesModule {}
