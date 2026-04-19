export default function HomePage(): JSX.Element {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          MVP · Step 2 · Auth &amp; RBAC
        </span>
        <h1 className="text-4xl font-bold tracking-tight">RFP Pulse</h1>
        <p className="max-w-xl text-muted-foreground">
          AI-driven, multi-tenant RFP response management. Auth and RBAC are live in this step; RAG,
          ingestion, and the workflow UI land in subsequent steps.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <a className="rounded-md border px-4 py-2 font-medium hover:bg-accent" href="/login">
          Sign in →
        </a>
        <a
          className="rounded-md border px-4 py-2 font-medium hover:bg-accent"
          href="http://localhost:4000/health"
          target="_blank"
          rel="noreferrer"
        >
          API health →
        </a>
        <a
          className="rounded-md border px-4 py-2 font-medium hover:bg-accent"
          href="https://github.com/Cescolinguisticservices/rfp-pulse"
          target="_blank"
          rel="noreferrer"
        >
          Repository →
        </a>
      </div>
    </main>
  );
}
