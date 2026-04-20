import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { AnswersModule } from './answers/answers.module';
import { AuthModule } from './auth/auth.module';
import { CompetitorsModule } from './competitors/competitors.module';
import { HealthController } from './health/health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { QuestionsModule } from './questions/questions.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    AccountModule,
    AdminModule,
    AiModule,
    AnswersModule,
    CompetitorsModule,
    IngestionModule,
    ProjectsModule,
    QuestionsModule,
    TenantsModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
