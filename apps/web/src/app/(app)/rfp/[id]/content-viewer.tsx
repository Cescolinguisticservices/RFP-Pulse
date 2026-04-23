'use client';

import { useMemo } from 'react';

/**
 * Read-only viewer for an RFP's extracted content.
 *
 * When the ingestion pipeline produced an HTML rendering (DOCX via mammoth),
 * we render that directly so headings / bold / italics / lists / tables keep
 * their formatting. Otherwise we fall back to the plain-text extraction and
 * convert blank lines into paragraphs.
 */
function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (paragraphs.length === 0) return '<p></p>';
  return paragraphs
    .map((block) => {
      const escaped = block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p>${escaped.replace(/\n/g, '<br />')}</p>`;
    })
    .join('');
}

export function RfpContentViewer({
  html,
  text,
}: {
  html?: string | null;
  text: string | null;
}): JSX.Element {
  const content = useMemo(() => {
    if (html && html.trim().length > 0) return html;
    if (text && text.trim().length > 0) return textToHtml(text);
    return '<p class="text-muted-foreground">Original text not available.</p>';
  }, [html, text]);

  return (
    <div
      className="max-h-[640px] overflow-y-auto rounded-md border bg-background p-4"
      data-testid="rfp-content-viewer"
    >
      <div
        className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
