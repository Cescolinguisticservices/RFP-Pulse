import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile as UploadedFileDecorator,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Role } from '@rfp-pulse/db';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IngestionService, type UploadedFile } from './ingestion.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('upload-rfp')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadRfp(
    @UploadedFileDecorator() file: UploadedFile | undefined,
    @Body('projectId') projectId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertFile(file);
    const { document, extractedText, metadata } = await this.ingestion.uploadRfp({
      tenantId: user.tenantId,
      file,
      projectId: projectId ?? null,
    });
    return {
      documentId: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      textLength: extractedText.length,
      preview: extractedText.slice(0, 500),
      metadata,
    };
  }

  @Post('upload-foia')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadFoia(
    @UploadedFileDecorator() file: UploadedFile | undefined,
    @Body('competitorName') competitorName: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertFile(file);
    if (!competitorName || competitorName.trim().length === 0) {
      throw new BadRequestException('competitorName is required');
    }
    const { document, intel } = await this.ingestion.uploadFoia({
      tenantId: user.tenantId,
      file,
      competitorName: competitorName.trim(),
    });
    return {
      documentId: document.id,
      intelId: intel.id,
      competitorName: intel.competitorName,
      pricingModel: intel.pricingModel,
      technicalStrategies: intel.technicalStrategies,
      winThemes: intel.winThemes,
    };
  }
}

function assertFile(file: UploadedFile | undefined): asserts file is UploadedFile {
  if (!file) throw new BadRequestException('file is required (multipart/form-data field "file")');
}
