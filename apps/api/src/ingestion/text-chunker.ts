/**
 * Splits free-form extracted document text into semantically-ish coherent
 * chunks suitable for embedding + pgvector storage.
 *
 * The algorithm walks paragraph-like boundaries (blank lines), packs them into
 * a running buffer up to `maxChars`, and emits a chunk whenever adding the
 * next paragraph would exceed the limit. If a single paragraph is already
 * larger than `maxChars`, it is hard-split on sentence boundaries (or on
 * whitespace as a fallback) so no chunk ever exceeds the cap.
 *
 * A small trailing overlap (`overlapChars`) from the previous chunk is
 * prepended to the next chunk so retrieval still works across boundaries.
 */
export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
  /** Hard cap on how many chunks we'll emit from a single document. */
  maxChunks?: number;
}

const DEFAULTS = {
  maxChars: 1200,
  overlapChars: 120,
  maxChunks: 60,
} as const;

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? DEFAULTS.maxChars;
  const overlapChars = opts.overlapChars ?? DEFAULTS.overlapChars;
  const maxChunks = opts.maxChunks ?? DEFAULTS.maxChunks;

  const normalised = input.replace(/\r\n?/g, '\n').trim();
  if (normalised.length === 0) return [];

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const units: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= maxChars) {
      units.push(p);
    } else {
      units.push(...hardSplit(p, maxChars));
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current.length === 0) {
      current = unit;
      continue;
    }
    const candidate = `${current}\n\n${unit}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      if (chunks.length >= maxChunks) return chunks;
      const tail = overlapChars > 0 ? current.slice(-overlapChars) : '';
      current = tail.length > 0 ? `${tail}\n\n${unit}` : unit;
    }
  }
  if (current.length > 0 && chunks.length < maxChunks) chunks.push(current);
  return chunks;
}

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let cut = findBreakpoint(remaining, maxChars);
    if (cut <= 0) cut = maxChars;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) pieces.push(remaining);
  return pieces;
}

function findBreakpoint(text: string, maxChars: number): number {
  const window = text.slice(0, maxChars);
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('.\n'),
  );
  if (sentenceEnd > maxChars * 0.4) return sentenceEnd + 1;
  const ws = window.lastIndexOf(' ');
  return ws > 0 ? ws : maxChars;
}
