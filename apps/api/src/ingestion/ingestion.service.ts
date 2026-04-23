import { Injectable } from '@nestjs/common';

import { DocumentKind, LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import { PrismaService } from '../prisma/prisma.service';
import { FoiaAnalyzerService } from './foia-analyzer.service';
import { parseDocument } from './parsers/document-parser';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadRfpInput {
  tenantId: string;
  file: UploadedFile;
  /** Optional existing project to attach the document to. */
  projectId?: string | null;
}

export interface UploadFoiaInput {
  tenantId: string;
  file: UploadedFile;
  competitorName: string;
  /** Tenant's default LLM provider (from session.tenant.defaultProvider). */
  provider?: LLMProviderEnum;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foia: FoiaAnalyzerService,
  ) {}

  /**
   * Parses an uploaded RFP document (PDF/DOCX/XLSX/text), persists a
   * {@link Document} row carrying the extracted text (as a dev placeholder for
   * the eventual S3 object key), and returns the document + extracted text.
   */
  async uploadRfp(input: UploadRfpInput) {
    const parsed = await parseDocument({
      buffer: input.file.buffer,
      mimeType: input.file.mimetype,
      filename: input.file.originalname,
    });

    const document = await this.prisma.document.create({
      data: {
        tenantId: input.tenantId,
        projectId: input.projectId ?? null,
        filename: input.file.originalname,
        mimeType: input.file.mimetype,
        sizeBytes: input.file.size,
        kind: DocumentKind.RFP,
        s3Key: null,
      },
    });

    return {
      document,
      extractedText: parsed.text,
      metadata: parsed.metadata,
    };
  }

  /**
   * Parses a competitor / FOIA document, runs the LangChain FOIA prompt
   * against the configured LLM, and persists a {@link CompetitorIntel} row.
   */
  async uploadFoia(input: UploadFoiaInput) {
    const parsed = await parseDocument({
      buffer: input.file.buffer,
      mimeType: input.file.mimetype,
      filename: input.file.originalname,
    });

    const document = await this.prisma.document.create({
      data: {
        tenantId: input.tenantId,
        filename: input.file.originalname,
        mimeType: input.file.mimetype,
        sizeBytes: input.file.size,
        kind: DocumentKind.FOIA,
        s3Key: null,
      },
    });

    const analysis = await this.foia.analyze({
      text: parsed.text,
      provider: input.provider ?? LLMProviderEnum.OPENAI,
    });

    const intel = await this.prisma.competitorIntel.create({
      data: {
        tenantId: input.tenantId,
        competitorName: input.competitorName,
        rawText: parsed.text,
        pricingModel: analysis.pricingModel,
        technicalStrategies: analysis.technicalStrategies,
        winThemes: analysis.winThemes,
        sourceDocumentId: document.id,
      },
    });

    return { document, intel, extractedText: parsed.text };
  }
}
