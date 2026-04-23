import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { DocumentKind, Role } from '@rfp-pulse/db';

import { FoiaAnalyzerService } from '../src/ingestion/foia-analyzer.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

describe('Ingestion endpoints (Step 4.20–4.24)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let adminUserId: string;
  let readOnlyUserId: string;
  let foia: FoiaAnalyzerService;
  let foiaInvocations: Array<unknown>;

  function signToken(role: Role, userId: string): string {
    return jwt.sign(
      {
        sub: userId,
        email: `${role.toLowerCase()}@ingest.test`,
        role,
        tenantId,
        tenantSlug: 'ingest-test',
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = JWT_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    foia = app.get(FoiaAnalyzerService);
    foiaInvocations = [];
    foia.setChatModelBuilder(
      () =>
        ({
          invoke: async (messages: unknown) => {
            foiaInvocations.push(messages);
            return new AIMessage(
              JSON.stringify({
                pricingModel:
                  'Per-seat subscription at $49/user/month with 20% volume discount above 500 seats.',
                technicalStrategies:
                  'Microservices on AWS EKS; PostgreSQL with read replicas; Redis caching tier.',
                winThemes: 'Fastest time-to-value; 24/7 enterprise support; ISO 27001 certified.',
              }),
            );
          },
        }) as never,
    );

    const tenant = await prisma.tenant.create({
      data: { name: 'Ingestion Test Tenant', slug: `ingest-${Date.now()}` },
    });
    tenantId = tenant.id;
    const admin = await prisma.user.create({
      data: { tenantId, email: 'admin@ingest.test', role: Role.ADMIN },
    });
    const ro = await prisma.user.create({
      data: { tenantId, email: 'readonly@ingest.test', role: Role.READ_ONLY },
    });
    adminUserId = admin.id;
    readOnlyUserId = ro.id;
  });

  afterAll(async () => {
    await prisma.competitorIntel.deleteMany({ where: { tenantId } });
    await prisma.document.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('rejects unauthenticated uploads with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/upload-rfp')
      .attach('file', Buffer.from('hello'), 'rfp.txt')
      .expect(401);
  });

  it('rejects a READ_ONLY user with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/upload-rfp')
      .set('Authorization', `Bearer ${signToken(Role.READ_ONLY, readOnlyUserId)}`)
      .attach('file', Buffer.from('hello'), 'rfp.txt')
      .expect(403);
  });

  it('extracts RFP text and persists a Document row (Step 4.24 verification)', async () => {
    const body = 'Section 1: Background\n\nPlease describe your approach to cloud security.';
    const res = await request(app.getHttpServer())
      .post('/api/upload-rfp')
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .attach('file', Buffer.from(body, 'utf-8'), 'rfp-sample.txt')
      .expect(201);

    expect(res.body).toMatchObject({
      filename: 'rfp-sample.txt',
      textLength: body.length,
    });
    expect(res.body.preview).toContain('cloud security');
    expect(res.body.documentId).toEqual(expect.any(String));

    const row = await prisma.document.findUnique({ where: { id: res.body.documentId } });
    expect(row).not.toBeNull();
    expect(row?.tenantId).toBe(tenantId);
    expect(row?.kind).toBe(DocumentKind.RFP);
    expect(row?.filename).toBe('rfp-sample.txt');
  });

  it('parses Excel sheet names + rows', async () => {
    // Hand-rolled minimal XLSX via SheetJS to exercise the parser end-to-end.
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Question', 'Weight'],
        ['Security', 0.4],
        ['Pricing', 0.6],
      ]),
      'Scoring',
    );
    const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app.getHttpServer())
      .post('/api/upload-rfp')
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .attach('file', buffer, {
        filename: 'scoring.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);

    expect(res.body.metadata.sheetNames).toEqual(['Scoring']);
    expect(res.body.preview).toContain('Scoring');
    expect(res.body.preview).toContain('Security');
    expect(res.body.preview).toContain('Pricing');
  });

  it('runs the FOIA LangChain prompt and persists CompetitorIntel', async () => {
    const body =
      'Acme Corp proposal: tiered SaaS pricing, microservices on AWS, emphasis on 24/7 support.';
    const res = await request(app.getHttpServer())
      .post('/api/upload-foia')
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .field('competitorName', 'Acme Corp')
      .attach('file', Buffer.from(body, 'utf-8'), 'acme-foia.txt')
      .expect(201);

    expect(res.body).toMatchObject({
      competitorName: 'Acme Corp',
      pricingModel: expect.stringContaining('Per-seat'),
      technicalStrategies: expect.stringContaining('Microservices'),
      winThemes: expect.stringContaining('Fastest time-to-value'),
    });
    expect(foiaInvocations).toHaveLength(1);
    const messages = foiaInvocations[0] as Array<{ content: unknown }>;
    expect(String(messages[1].content)).toContain(body);
    expect(String(messages[1].content)).toContain('Extract pricing models');

    const intel = await prisma.competitorIntel.findUnique({ where: { id: res.body.intelId } });
    expect(intel).not.toBeNull();
    expect(intel?.tenantId).toBe(tenantId);
    expect(intel?.competitorName).toBe('Acme Corp');
    expect(intel?.rawText).toBe(body);
    expect(intel?.sourceDocumentId).toBe(res.body.documentId);
  });

  it('rejects FOIA upload missing competitorName', async () => {
    await request(app.getHttpServer())
      .post('/api/upload-foia')
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .attach('file', Buffer.from('x'), 'x.txt')
      .expect(400);
  });
});
