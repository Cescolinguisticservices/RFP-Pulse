import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';

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
  projectId?: string | null;
  file: UploadedFile;
  /** Human-readable RFP name (becomes `RFPProject.title`). Required. */
  rfpName: string;
  /** Optional client/agency issuing the RFP. */
  clientName?: string | null;
  /** Optional response deadline. */
  dueAt?: Date | null;
  /** Optional user within the same tenant to assign the RFP to. */
  assigneeId?: string | null;
  /** Optional references to existing proposal/RFP project ids. */
  referenceProjectIds?: string[];
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
    if (!input.projectId && !rfpName) {
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
    const referenceProjectIds = Array.from(new Set(input.referenceProjectIds ?? []));
    if (referenceProjectIds.length > 0) {
      const refs = await this.prisma.rFPProject.findMany({
        where: { id: { in: referenceProjectIds }, tenantId: input.tenantId },
        select: { id: true },
      });
      const valid = new Set(refs.map((r) => r.id));
      for (const refId of referenceProjectIds) {
        if (!valid.has(refId)) {
          throw new BadRequestException(`referenceProjectId ${refId} does not belong to this tenant`);
        }
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
    const previewPdfPayload = await toInlinePdfPreviewPayload(input.file, parsed.text);

    const { project, document } = await this.prisma.$transaction(async (tx) => {
      const project = input.projectId
        ? await tx.rFPProject.findFirst({
            where: { id: input.projectId, tenantId: input.tenantId },
          })
        : await tx.rFPProject.create({
            data: {
              tenantId: input.tenantId,
              title: rfpName,
              clientName: input.clientName ?? null,
              dueAt: input.dueAt ?? null,
              createdById: input.createdById,
              assigneeId: input.assigneeId ?? null,
              referenceProjectIds,
            },
          });
      if (!project) {
        throw new BadRequestException('projectId does not belong to this tenant');
      }
      const document = await tx.document.create({
        data: {
          tenantId: input.tenantId,
          projectId: project.id,
          filename: input.file.originalname,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          kind: DocumentKind.RFP,
          // Step 4 (object storage) is not wired yet. Store a temporary inline
          // PDF payload for in-app document preview.
          s3Key: previewPdfPayload,
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

async function toInlinePdfPreviewPayload(file: UploadedFile, extractedText: string): Promise<string | null> {
  if (isPdfFile(file)) {
    if (file.size > 10 * 1024 * 1024) return null;
    return `inline-pdf-b64:${file.buffer.toString('base64')}`;
  }
  if (!isConvertibleToPdf(file)) return null;
  const generated = await buildPdfFromText(extractedText);
  if (!generated || generated.length === 0) return null;
  // Keep payload bounded to avoid very large DB rows until object storage is
  // available.
  if (generated.length > 10 * 1024 * 1024) return null;
  return `inline-pdf-b64:${Buffer.from(generated).toString('base64')}`;
}

function isConvertibleToPdf(file: UploadedFile): boolean {
  const name = file.originalname.toLowerCase();
  return (
    name.endsWith('.docx') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.txt') ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'text/plain'
  );
}

async function buildPdfFromText(raw: string): Promise<Uint8Array | null> {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length === 0) return null;

  // Keep generation bounded to protect latency and payload size.
  const bounded = text.slice(0, 220_000);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const fontSize = 11;
  const lineHeight = 15;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const paragraph of bounded.split('\n')) {
    const lines = wrapText(paragraph, font, fontSize, maxWidth);
    if (lines.length === 0) {
      y -= lineHeight;
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      continue;
    }

    for (const line of lines) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
  }

  return pdf.save();
}

function isPdfFile(file: UploadedFile): boolean {
  if (file.mimetype === 'application/pdf') return true;
  return file.originalname.toLowerCase().endsWith('.pdf');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}
