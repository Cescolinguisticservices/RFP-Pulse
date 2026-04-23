import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { Role, WorkflowState } from '@rfp-pulse/db';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

describe('Answer workflow transitions (Step 6b)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let projectId: string;
  let questionId: string;
  let adminUserId: string;
  let smeUserId: string;
  let reviewerUserId: string;
  let approverUserId: string;
  let readOnlyUserId: string;

  function signToken(role: Role, userId: string): string {
    return jwt.sign(
      {
        sub: userId,
        email: `${role.toLowerCase()}@workflow.test`,
        role,
        tenantId,
        tenantSlug: 'workflow-test',
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
  }

  async function createAnswer(state: WorkflowState): Promise<string> {
    const answer = await prisma.rFPAnswer.create({
      data: {
        tenantId,
        questionId,
        content: 'Draft body',
        state,
      },
    });
    return answer.id;
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = JWT_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: 'Workflow Test Tenant', slug: `workflow-${Date.now()}` },
    });
    tenantId = tenant.id;
    const admin = await prisma.user.create({
      data: { tenantId, email: 'admin@workflow.test', role: Role.ADMIN },
    });
    const sme = await prisma.user.create({
      data: { tenantId, email: 'sme@workflow.test', role: Role.SME },
    });
    const reviewer = await prisma.user.create({
      data: { tenantId, email: 'reviewer@workflow.test', role: Role.REVIEWER },
    });
    const approver = await prisma.user.create({
      data: { tenantId, email: 'approver@workflow.test', role: Role.APPROVER },
    });
    const ro = await prisma.user.create({
      data: { tenantId, email: 'ro@workflow.test', role: Role.READ_ONLY },
    });
    adminUserId = admin.id;
    smeUserId = sme.id;
    reviewerUserId = reviewer.id;
    approverUserId = approver.id;
    readOnlyUserId = ro.id;

    const project = await prisma.rFPProject.create({
      data: { tenantId, title: 'Workflow Project' },
    });
    projectId = project.id;
    const question = await prisma.rFPQuestion.create({
      data: { tenantId, projectId, questionText: 'Describe HA architecture.' },
    });
    questionId = question.id;
  });

  afterAll(async () => {
    await prisma.rFPAnswer.deleteMany({ where: { tenantId } });
    await prisma.rFPQuestion.deleteMany({ where: { tenantId } });
    await prisma.rFPProject.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('rejects unauthenticated transition with 401', async () => {
    const answerId = await createAnswer(WorkflowState.DRAFTING);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .send({ to: 'IN_REVIEW' })
      .expect(401);
  });

  it('SME advances DRAFTING -> IN_REVIEW', async () => {
    const answerId = await createAnswer(WorkflowState.DRAFTING);
    const res = await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.SME, smeUserId)}`)
      .send({ to: 'IN_REVIEW' })
      .expect(201);
    expect(res.body.state).toBe('IN_REVIEW');

    const row = await prisma.rFPAnswer.findUniqueOrThrow({ where: { id: answerId } });
    expect(row.state).toBe(WorkflowState.IN_REVIEW);
    expect(row.reviewerId).toBeNull();
  });

  it('rejects SME attempting IN_REVIEW -> PENDING_APPROVAL (403)', async () => {
    const answerId = await createAnswer(WorkflowState.IN_REVIEW);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.SME, smeUserId)}`)
      .send({ to: 'PENDING_APPROVAL' })
      .expect(403);
  });

  it('REVIEWER advances IN_REVIEW -> PENDING_APPROVAL', async () => {
    const answerId = await createAnswer(WorkflowState.IN_REVIEW);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.REVIEWER, reviewerUserId)}`)
      .send({ to: 'PENDING_APPROVAL' })
      .expect(201);
    const row = await prisma.rFPAnswer.findUniqueOrThrow({ where: { id: answerId } });
    expect(row.state).toBe(WorkflowState.PENDING_APPROVAL);
    expect(row.reviewerId).toBe(reviewerUserId);
  });

  it('APPROVER can APPROVE PENDING_APPROVAL', async () => {
    const answerId = await createAnswer(WorkflowState.PENDING_APPROVAL);
    const res = await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.APPROVER, approverUserId)}`)
      .send({ to: 'APPROVED' })
      .expect(201);
    expect(res.body.state).toBe('APPROVED');
  });

  it('APPROVER can REJECT PENDING_APPROVAL', async () => {
    const answerId = await createAnswer(WorkflowState.PENDING_APPROVAL);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.APPROVER, approverUserId)}`)
      .send({ to: 'REJECTED' })
      .expect(201);
  });

  it('rejects invalid transitions (DRAFTING -> APPROVED) with 400', async () => {
    const answerId = await createAnswer(WorkflowState.DRAFTING);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .send({ to: 'APPROVED' })
      .expect(400);
  });

  it('terminal APPROVED allows no further transitions', async () => {
    const answerId = await createAnswer(WorkflowState.APPROVED);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.ADMIN, adminUserId)}`)
      .send({ to: 'DRAFTING' })
      .expect(400);
  });

  it('REJECTED loops back to DRAFTING for rework', async () => {
    const answerId = await createAnswer(WorkflowState.REJECTED);
    const res = await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.SME, smeUserId)}`)
      .send({ to: 'DRAFTING' })
      .expect(201);
    expect(res.body.state).toBe('DRAFTING');
  });

  it('READ_ONLY user is 403 even for valid state edges', async () => {
    const answerId = await createAnswer(WorkflowState.DRAFTING);
    await request(app.getHttpServer())
      .post(`/api/answers/${answerId}/transition`)
      .set('Authorization', `Bearer ${signToken(Role.READ_ONLY, readOnlyUserId)}`)
      .send({ to: 'IN_REVIEW' })
      .expect(403);
  });

  it('rejects cross-tenant transitions with 403', async () => {
    const answerId = await createAnswer(WorkflowState.DRAFTING);
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Other', slug: `other-${Date.now()}` },
    });
    try {
      const otherAdmin = await prisma.user.create({
        data: { tenantId: otherTenant.id, email: 'admin@other.test', role: Role.ADMIN },
      });
      const crossToken = jwt.sign(
        {
          sub: otherAdmin.id,
          email: otherAdmin.email,
          role: Role.ADMIN,
          tenantId: otherTenant.id,
          tenantSlug: otherTenant.slug,
        },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      await request(app.getHttpServer())
        .post(`/api/answers/${answerId}/transition`)
        .set('Authorization', `Bearer ${crossToken}`)
        .send({ to: 'IN_REVIEW' })
        .expect(403);
    } finally {
      await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } });
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    }
  });
});
