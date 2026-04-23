import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionsController } from './questions.controller';

@Module({
  imports: [AiModule, AuthModule, PrismaModule],
  controllers: [QuestionsController],
})
export class QuestionsModule {}
