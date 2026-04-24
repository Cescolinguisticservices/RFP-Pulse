'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

/**
 * Read-only viewer for uploaded RFP content.
 *
 * Preferred path: render the uploaded/converted PDF via react-pdf-viewer.
 * Fallback: render extracted HTML/text when a PDF preview isn't available.
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
  pdfBase64,
  html,
  text,
}: {
  mimeType?: string | null;
  docxBase64?: string | null;
  pdfBase64?: string | null;
  html?: string | null;
  text: string | null;
}): JSX.Element {
  const PdfViewer = useMemo(
    () =>
      dynamic(() => import('./pdf-viewer-client').then((m) => m.PdfViewerClient), {
        ssr: false,
      }),
    [],
  );

  const fileUrl = useMemo(
    () => (pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : null),
    [pdfBase64],
  );

  const content = useMemo(() => {
    if (html && html.trim().length > 0) return html;
    if (text && text.trim().length > 0) return textToHtml(text);
    return '<p class="text-muted-foreground">Original text not available.</p>';
  }, [html, text]);

  return (
    <div
      className="max-h-[680px] overflow-y-auto rounded-md border bg-background p-2"
      data-testid="rfp-content-viewer"
    >
      {fileUrl ? (
        <PdfViewer fileUrl={fileUrl} />
      ) : (
        <div
          className="prose prose-sm max-w-none p-2 text-sm leading-relaxed dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  );
}
