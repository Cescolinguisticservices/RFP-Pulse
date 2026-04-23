import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import * as XLSX from 'xlsx';

import pdfParse from './pdf-parse-loader';

/**
 * Whitelist of tags/attributes we allow in extracted DOCX HTML. Mammoth's
 * default output is already conservative, but we run the result through
 * sanitize-html defensively so a crafted DOCX cannot inject script handlers
 * or other XSS vectors into the RFP detail viewer.
 */
const DOCX_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'sup',
    'sub',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'caption',
    'colgroup',
    'col',
    'a',
    'img',
    'span',
    'div',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

/**
 * Thrown when the caller uploads a file format the ingestion pipeline cannot
 * handle (e.g. legacy binary `.doc`). Controllers catch this and map to a 400.
 */
export class UnsupportedDocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedDocumentFormatError';
  }
}

export interface ParsedDocument {
  /** Canonical plain-text rendering of the document. */
  text: string;
  /**
   * Optional formatted HTML rendering. Populated for DOCX via mammoth so the
   * detail viewer can preserve headings/bold/lists/tables. Plain text is
   * still populated for RAG chunking and AI prompts.
   */
  html?: string;
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
  if (mimeType === 'application/msword' || ext === 'doc') {
    throw new UnsupportedDocumentFormatError(
      'Legacy .doc files are not supported. Please save as .docx and try again.',
    );
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
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
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
  ]);
  const rawHtml = htmlResult.value.trim();
  const safeHtml = rawHtml ? sanitizeHtml(rawHtml, DOCX_HTML_SANITIZE_OPTIONS).trim() : '';
  return {
    text: textResult.value.trim(),
    html: safeHtml || undefined,
    metadata: {
      warnings: [
        ...htmlResult.messages.map((m) => m.message),
        ...textResult.messages.map((m) => m.message),
      ],
    },
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
