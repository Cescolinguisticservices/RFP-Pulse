import { getServerSession } from 'next-auth';

import { apiBaseUrl } from '@/lib/api-url';
import { authOptions } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CompetitorIntelSummary {
  id: string;
  competitorName: string;
  pricingModel: string | null;
  technicalStrategies: string | null;
  winThemes: string | null;
  sourceDocumentId: string | null;
  updatedAt: string;
}

async function fetchCompetitors(accessToken: string): Promise<CompetitorIntelSummary[]> {
  const res = await fetch(`${apiBaseUrl()}/api/competitors`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/competitors failed: ${res.status}`);
  const body = (await res.json()) as { competitors: CompetitorIntelSummary[] };
  return body.competitors;
}

export default async function CompetitorsPage(): Promise<JSX.Element> {
  const session = await getServerSession(authOptions);
  if (!session) return <p className="text-sm text-muted-foreground">Not authenticated.</p>;

  let competitors: CompetitorIntelSummary[] = [];
  let error: string | null = null;
  try {
    competitors = await fetchCompetitors(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Competitor Intel</h1>
        <p className="text-sm text-muted-foreground">
          Pricing models, technical strategies, and win themes extracted from uploaded competitor /
          FOIA documents.
        </p>
      </header>

      {error && <p className="text-sm text-destructive">Failed to load: {error}</p>}

      {!error && competitors.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No intel yet</CardTitle>
            <CardDescription>
              Upload a competitor / FOIA document under Uploads to populate this view.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2" data-testid="competitor-list">
        {competitors.map((c) => (
          <Card key={c.id} data-testid={`competitor-${c.id}`}>
            <CardHeader>
              <CardTitle>{c.competitorName}</CardTitle>
              <CardDescription>Updated {new Date(c.updatedAt).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {c.pricingModel && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pricing model
                  </div>
                  <div className="whitespace-pre-wrap">{c.pricingModel}</div>
                </div>
              )}
              {c.technicalStrategies && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Technical strategies
                  </div>
                  <div className="whitespace-pre-wrap">{c.technicalStrategies}</div>
                </div>
              )}
              {c.winThemes && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Win themes
                  </div>
                  <div className="whitespace-pre-wrap">{c.winThemes}</div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
