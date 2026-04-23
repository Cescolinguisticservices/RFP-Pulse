'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';

/**
 * Read-only Tiptap viewer for an RFP's extracted plain text. Paragraph
 * breaks in the source (blank lines) become <p> blocks so headings /
 * numbered lists retain their visual grouping. Single line breaks become
 * hard breaks inside a paragraph.
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

export function RfpContentViewer({ text }: { text: string | null }): JSX.Element {
  const content = useMemo(
    () => (text ? textToHtml(text) : '<p>Original text not available.</p>'),
    [text],
  );

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: false,
    immediatelyRender: false,
  });

  if (!editor) {
    return (
      <div
        className="max-h-[480px] overflow-y-auto rounded-md border bg-muted/10 p-4 text-sm text-muted-foreground"
        data-testid="rfp-content-loading"
      >
        Loading content…
      </div>
    );
  }

  return (
    <div
      className="max-h-[480px] overflow-y-auto rounded-md border bg-background p-4"
      data-testid="rfp-content-viewer"
    >
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
      />
    </div>
  );
}
