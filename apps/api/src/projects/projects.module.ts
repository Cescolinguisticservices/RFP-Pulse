import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
