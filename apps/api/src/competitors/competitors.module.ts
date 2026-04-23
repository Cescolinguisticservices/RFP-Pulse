import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CompetitorsController } from './competitors.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CompetitorsController],
})
export class CompetitorsModule {}
