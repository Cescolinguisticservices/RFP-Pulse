import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { Role } from '@rfp-pulse/db';

import { AppModule } from '../src/app.module';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

function signToken(role: Role, overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'user-fixture-id',
      email: `${role.toLowerCase()}@acme.test`,
      role,
      tenantId: 'tenant-fixture-id',
      tenantSlug: 'acme',
      ...overrides,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

describe('RBAC guard (admin/ping)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = JWT_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/admin/ping').expect(401);
  });

  it('rejects a READ_ONLY user with 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${signToken(Role.READ_ONLY)}`)
      .expect(403);
  });

  it('rejects an RFP_MANAGER with 403 (only ADMIN may ping)', async () => {
    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${signToken(Role.RFP_MANAGER)}`)
      .expect(403);
  });

  it('allows an ADMIN with 200 and echoes the authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${signToken(Role.ADMIN)}`)
      .expect(200);
    expect(res.body).toMatchObject({
      ok: true,
      user: { role: Role.ADMIN, tenantSlug: 'acme' },
    });
  });

  it('rejects a token signed with the wrong secret with 401', async () => {
    const badToken = jwt.sign(
      { sub: 'x', role: Role.ADMIN, tenantId: 't', tenantSlug: 's', email: 'x@y' },
      'wrong-secret',
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${badToken}`)
      .expect(401);
  });
});
