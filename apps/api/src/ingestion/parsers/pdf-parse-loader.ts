/**
 * `pdf-parse` executes a `test/data/...` fixture at import time if it detects
 * it is the main module. The default `require('pdf-parse')` path triggers that
 * behaviour under some bundlers; we pull directly from the lib entrypoint to
 * avoid it. Typed loosely because the package ships no default export.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pdfParseImpl = require('pdf-parse/lib/pdf-parse.js') as (
  buffer: Buffer,
) => Promise<{ text: string; numpages: number; info: unknown }>;

export default pdfParseImpl;
