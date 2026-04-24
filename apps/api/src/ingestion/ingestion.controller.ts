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

interface UploadRfpBody {
  rfpName?: string;
  clientName?: string;
  /** ISO date (YYYY-MM-DD) or full ISO timestamp. */
  dueDate?: string;
  assigneeId?: string;
  /** CSV or JSON array of project ids used as reference proposals. */
  referenceProjectIds?: string;
}

@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('upload-rfp')
  @Roles(Role.ADMIN, Role.RFP_MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadRfp(
    @UploadedFileDecorator() file: UploadedFile | undefined,
    @Body() body: UploadRfpBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertFile(file);
    const rfpName = (body.rfpName ?? '').trim();
    if (!rfpName) {
      throw new BadRequestException('rfpName is required');
    }
    const clientName = (body.clientName ?? '').trim() || null;
    const dueAt = parseDueAt(body.dueDate);
    const assigneeId = (body.assigneeId ?? '').trim() || null;
    const referenceProjectIds = parseReferenceProjectIds(body.referenceProjectIds);

    const { document, project, extractedText, metadata, indexedChunks } =
      await this.ingestion.uploadRfp({
        tenantId: user.tenantId,
        createdById: user.id,
        file,
        rfpName,
        clientName,
        dueAt,
        assigneeId,
        referenceProjectIds,
      });
    return {
      documentId: document.id,
      projectId: project.id,
      rfpName: project.title,
      clientName: project.clientName,
      dueAt: project.dueAt ? project.dueAt.toISOString() : null,
      assigneeId: project.assigneeId,
      referenceProjectIds: project.referenceProjectIds,
      status: project.status,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      textLength: extractedText.length,
      preview: extractedText.slice(0, 500),
      indexedChunks,
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

/** Accepts YYYY-MM-DD or full ISO timestamp; returns null when blank. */
function parseDueAt(value: string | undefined): Date | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`dueDate "${trimmed}" is not a valid date`);
  }
  return date;
}

function parseReferenceProjectIds(raw: string | undefined): string[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      return Array.from(
        new Set(
          parsed
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter((v) => v.length > 0),
        ),
      );
    } catch {
      return [];
    }
  }
  return Array.from(
    new Set(
      trimmed
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    ),
  );
}
