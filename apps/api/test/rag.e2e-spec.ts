import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { RagService } from '../src/ai/rag.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('RagService (pgvector RAG round-trip — Step 3.17/3.18/3.19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rag: RagService;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    // Force DeterministicMockEmbeddings so CI doesn't need an OPENAI key.
    delete process.env.OPENAI_API_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    rag = app.get(RagService);

    const suffix = Date.now();
    const [t1, t2] = await Promise.all([
      prisma.tenant.create({ data: { name: 'RAG Test Tenant A', slug: `rag-a-${suffix}` } }),
      prisma.tenant.create({ data: { name: 'RAG Test Tenant B', slug: `rag-b-${suffix}` } }),
    ]);
    tenantId = t1.id;
    otherTenantId = t2.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_base_entries WHERE "tenantId" IN ($1, $2)`,
      tenantId,
      otherTenantId,
    );
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await app.close();
  });

  it('indexes entries and retrieves the exact match as the nearest neighbour', async () => {
    const titles = ['Security compliance', 'Pricing model', 'Support SLA'];
    const contents = [
      'SOC 2 Type II, ISO 27001, penetration testing quarterly.',
      'Tiered per-seat SaaS pricing with volume discounts.',
      '99.9% uptime SLA with 1-hour P1 response time.',
    ];
    await Promise.all(
      titles.map((title, i) => rag.indexEntry({ tenantId, title, content: contents[i] })),
    );

    // DeterministicMockEmbeddings are a pure function of the input string, so
    // embedding `${title}\n\n${content}` of the 2nd entry and using it as a
    // query yields similarity == 1.0 for that row and near-zero for the others.
    const queryMatchingPricing = `Pricing model\n\n${contents[1]}`;
    const results = await rag.retrieveTopK(tenantId, queryMatchingPricing, 3);

    expect(results).toHaveLength(3);
    expect(results[0].title).toBe('Pricing model');
    expect(results[0].similarity).toBeCloseTo(1, 5);
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    expect(results[1].similarity).toBeGreaterThanOrEqual(results[2].similarity);
  });

  it('scopes retrieval to the requested tenant', async () => {
    await rag.indexEntry({
      tenantId: otherTenantId,
      title: 'Cross-tenant leak',
      content: 'This should never surface under tenant A.',
    });

    const results = await rag.retrieveTopK(
      tenantId,
      'Cross-tenant leak\n\nThis should never surface under tenant A.',
      3,
    );

    for (const r of results) {
      expect(r.title).not.toBe('Cross-tenant leak');
    }
  });
});
