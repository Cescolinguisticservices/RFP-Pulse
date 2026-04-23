import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountController } from './account.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AccountController],
})
export class AccountModule {}
