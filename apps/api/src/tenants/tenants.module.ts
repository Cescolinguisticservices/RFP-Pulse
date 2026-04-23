import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TenantsController],
})
export class TenantsModule {}
