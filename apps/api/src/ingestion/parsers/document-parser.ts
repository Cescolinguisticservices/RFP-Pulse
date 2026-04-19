import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

import pdfParse from './pdf-parse-loader';

export interface ParsedDocument {
  /** Canonical plain-text rendering of the document. */
  text: string;
  /** Parser-specific metadata (page count, sheet names, etc.). */
  metadata: Record<string, unknown>;
}

/**
 * Detects document type from mime/filename and extracts plain text.
 * Supports PDF, DOCX, XLSX/XLS, and plain text. Unknown types are treated as UTF-8 text.
 */
export async function parseDocument(params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<ParsedDocument> {
  const kind = detectKind(params.mimeType, params.filename);
  switch (kind) {
    case 'pdf':
      return parsePdf(params.buffer);
    case 'docx':
      return parseDocx(params.buffer);
    case 'xlsx':
      return parseXlsx(params.buffer);
    case 'text':
      return parseText(params.buffer);
  }
}

type DocKind = 'pdf' | 'docx' | 'xlsx' | 'text';

function detectKind(mimeType: string, filename: string): DocKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return 'docx';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    return 'xlsx';
  }
  return 'text';
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const result = await pdfParse(buffer);
  return {
    text: result.text.trim(),
    metadata: { pages: result.numpages, info: result.info },
  };
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value.trim(),
    metadata: { warnings: result.messages.map((m) => m.message) },
  };
}

function parseXlsx(buffer: Buffer): ParsedDocument {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: Array<{ name: string; rows: unknown[][] }> = [];
  const textChunks: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    sheets.push({ name, rows });
    textChunks.push(`# Sheet: ${name}`);
    for (const row of rows) {
      textChunks.push(row.map((c) => (c == null ? '' : String(c))).join('\t'));
    }
  }
  return {
    text: textChunks.join('\n').trim(),
    metadata: { sheetNames: workbook.SheetNames, sheets },
  };
}

function parseText(buffer: Buffer): ParsedDocument {
  return {
    text: buffer.toString('utf-8').trim(),
    metadata: {},
  };
}
