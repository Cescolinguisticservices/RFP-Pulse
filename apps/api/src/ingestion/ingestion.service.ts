import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { DocumentKind, LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import { RagService } from '../ai/rag.service';
import { PrismaService } from '../prisma/prisma.service';
import { FoiaAnalyzerService } from './foia-analyzer.service';
import { parseDocument, UnsupportedDocumentFormatError } from './parsers/document-parser';
import { chunkText } from './text-chunker';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadRfpInput {
  tenantId: string;
  /** User who initiated the upload — becomes the project's createdBy. */
  createdById: string;
  file: UploadedFile;
  /** Human-readable RFP name (becomes `RFPProject.title`). Required. */
  rfpName: string;
  /** Optional client/agency issuing the RFP. */
  clientName?: string | null;
  /** Optional response deadline. */
  dueAt?: Date | null;
  /** Optional user within the same tenant to assign the RFP to. */
  assigneeId?: string | null;
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
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly foia: FoiaAnalyzerService,
    private readonly rag: RagService,
  ) {}

  /**
   * Parses an uploaded RFP document (PDF/DOCX/XLSX/text), persists a
   * {@link Document} row carrying the extracted text (as a dev placeholder for
   * the eventual S3 object key), chunks the extracted text and embeds each
   * chunk into `KnowledgeBaseEntry` so future RAG queries can retrieve it,
   * and returns the document + extraction metadata.
   */
  async uploadRfp(input: UploadRfpInput) {
    const rfpName = input.rfpName.trim();
    if (!rfpName) {
      throw new BadRequestException('rfpName is required');
    }
    if (input.assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: input.assigneeId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!assignee) {
        throw new BadRequestException('assigneeId does not belong to this tenant');
      }
    }

    let parsed;
    try {
      parsed = await parseDocument({
        buffer: input.file.buffer,
        mimeType: input.file.mimetype,
        filename: input.file.originalname,
      });
    } catch (err) {
      if (err instanceof UnsupportedDocumentFormatError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const { project, document } = await this.prisma.$transaction(async (tx) => {
      const project = await tx.rFPProject.create({
        data: {
          tenantId: input.tenantId,
          title: rfpName,
          clientName: input.clientName ?? null,
          dueAt: input.dueAt ?? null,
          createdById: input.createdById,
          assigneeId: input.assigneeId ?? null,
        },
      });
      const document = await tx.document.create({
        data: {
          tenantId: input.tenantId,
          projectId: project.id,
          filename: input.file.originalname,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          kind: DocumentKind.RFP,
          s3Key: null,
          extractedText: parsed.text,
          extractedHtml: parsed.html ?? null,
        },
      });
      return { project, document };
    });

    const indexedChunks = await this.indexChunks({
      tenantId: input.tenantId,
      documentId: document.id,
      filename: input.file.originalname,
      text: parsed.text,
    });

    return {
      project,
      document,
      extractedText: parsed.text,
      metadata: parsed.metadata,
      indexedChunks,
    };
  }

  private async indexChunks(args: {
    tenantId: string;
    documentId: string;
    filename: string;
    text: string;
  }): Promise<number> {
    const chunks = chunkText(args.text);
    if (chunks.length === 0) return 0;
    const source = `document:${args.documentId}`;
    let indexed = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const content = chunks[i];
      const title = `${args.filename} — chunk ${i + 1}/${chunks.length}`;
      try {
        await this.rag.indexEntry({
          tenantId: args.tenantId,
          title,
          content,
          source,
        });
        indexed += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to index chunk ${i + 1}/${chunks.length} for document ${args.documentId}: ${(err as Error).message}`,
        );
      }
    }
    return indexed;
  }

  /**
   * Parses a competitor / FOIA document, runs the LangChain FOIA prompt
   * against the configured LLM, and persists a {@link CompetitorIntel} row.
   */
  async uploadFoia(input: UploadFoiaInput) {
    let parsed;
    try {
      parsed = await parseDocument({
        buffer: input.file.buffer,
        mimeType: input.file.mimetype,
        filename: input.file.originalname,
      });
    } catch (err) {
      if (err instanceof UnsupportedDocumentFormatError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

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
