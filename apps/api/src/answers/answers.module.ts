import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnswersController } from './answers.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AnswersController],
})
export class AnswersModule {}
