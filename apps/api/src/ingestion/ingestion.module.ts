import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FoiaAnalyzerService } from './foia-analyzer.service';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [IngestionController],
  providers: [IngestionService, FoiaAnalyzerService],
  exports: [IngestionService, FoiaAnalyzerService],
})
export class IngestionModule {}
