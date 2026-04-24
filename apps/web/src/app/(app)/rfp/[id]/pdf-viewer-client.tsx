'use client';

import '@react-pdf-viewer/core/lib/styles/index.css';

import { Worker, Viewer } from '@react-pdf-viewer/core';

export function PdfViewerClient({ fileUrl }: { fileUrl: string }): JSX.Element {
  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
      <div className="h-[640px]" data-testid="rfp-content-pdf-viewer">
        <Viewer fileUrl={fileUrl} />
      </div>
    </Worker>
  );
}
