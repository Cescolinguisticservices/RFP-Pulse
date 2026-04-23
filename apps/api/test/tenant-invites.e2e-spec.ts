import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { Role } from '@rfp-pulse/db';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

describe('Tenant signup invites (Step 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformTenantId: string;
  let tenantAId: string;
  let superAdminId: string;
  let adminAId: string;
  const runSuffix = `step8-${Date.now()}`;
  const createdTenantSlugs: string[] = [];
  const createdInviteIds: string[] = [];

  function signToken(userId: string, role: Role, tenantId: string, tenantSlug: string): string {
    return jwt.sign(
      {
        sub: userId,
        email: `${role.toLowerCase()}@${tenantSlug}.test`,
        role,
        tenantId,
        tenantSlug,
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

    const platformTenant = await prisma.tenant.create({
      data: { name: 'Platform', slug: `platform-${runSuffix}` },
    });
    platformTenantId = platformTenant.id;
    const tenantA = await prisma.tenant.create({
      data: { name: 'Tenant A', slug: `tenant-a-${runSuffix}` },
    });
    tenantAId = tenantA.id;

    const passwordHash = hashSync('password123', 10);
    const superAdmin = await prisma.user.create({
      data: {
        tenantId: platformTenantId,
        email: `super-${runSuffix}@step8.test`,
        role: Role.SUPER_ADMIN,
        passwordHash,
      },
    });
    superAdminId = superAdmin.id;
    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `admin-${runSuffix}@a.test`,
        role: Role.ADMIN,
        passwordHash,
      },
    });
    adminAId = adminA.id;
  });

  afterAll(async () => {
    for (const id of createdInviteIds) {
      await prisma.tenantInvite.deleteMany({ where: { id } }).catch(() => undefined);
    }
    for (const slug of createdTenantSlugs) {
      const t = await prisma.tenant.findUnique({ where: { slug } });
      if (t) {
        await prisma.tenantInvite.deleteMany({ where: { redeemedTenantId: t.id } });
        await prisma.user.deleteMany({ where: { tenantId: t.id } });
        await prisma.tenant.delete({ where: { id: t.id } });
      }
    }
    for (const id of [tenantAId, platformTenantId]) {
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await app.close();
  });

  describe('POST /api/tenant-invites (SUPER_ADMIN only)', () => {
    it('SUPER_ADMIN can generate a signup invite', async () => {
      const token = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const res = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${token}`)
        .send({ intendedCompany: 'Initech', intendedEmail: 'ceo@initech.test' });
      expect(res.status).toBe(201);
      expect(res.body.token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(res.body.token.length).toBeGreaterThanOrEqual(32);
      expect(res.body.signupUrl).toBe(`/signup/${res.body.token}`);
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      createdInviteIds.push(res.body.id);
    });

    it('ADMIN (non-super) cannot generate a signup invite', async () => {
      const token = signToken(adminAId, Role.ADMIN, tenantAId, 'tenant-a');
      const res = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('unauthenticated request to create invite is rejected', async () => {
      const res = await request(app.getHttpServer()).post('/api/tenant-invites').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tenant-invites/:token', () => {
    let validToken: string;

    beforeAll(async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const res = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ intendedCompany: 'Globex', intendedEmail: 'owner@globex.test' });
      validToken = res.body.token;
      createdInviteIds.push(res.body.id);
    });

    it('returns valid=true for a fresh invite; public (no auth)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/tenant-invites/${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        valid: true,
        intendedCompany: 'Globex',
        intendedEmail: 'owner@globex.test',
      });
    });

    it('returns valid=false with reason=not_found for an unknown token', async () => {
      const res = await request(app.getHttpServer()).get('/api/tenant-invites/does-not-exist');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ valid: false, reason: 'not_found' });
    });

    it('returns valid=false with reason=expired for an expired invite', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ intendedCompany: 'Expired Corp' });
      createdInviteIds.push(create.body.id);
      await prisma.tenantInvite.update({
        where: { id: create.body.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const res = await request(app.getHttpServer()).get(
        `/api/tenant-invites/${create.body.token}`,
      );
      expect(res.body).toMatchObject({ valid: false, reason: 'expired' });
    });
  });

  describe('POST /api/tenant-invites/:token/redeem', () => {
    it('happy path: redeems invite, creates Tenant + ADMIN, marks invite used', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ intendedCompany: 'Umbrella Corp', intendedEmail: 'admin@umbrella.test' });
      createdInviteIds.push(create.body.id);

      const slug = `umbrella-${runSuffix}`;
      createdTenantSlugs.push(slug);
      const res = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Umbrella Corp',
          slug,
          adminEmail: 'admin@umbrella.test',
          adminName: 'Ada Wong',
          password: 'strong-pw-123',
        });
      expect(res.status).toBe(201);
      expect(res.body.tenant.slug).toBe(slug);
      expect(res.body.admin.email).toBe('admin@umbrella.test');

      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        include: { users: true },
      });
      expect(tenant).toBeTruthy();
      expect(tenant!.users).toHaveLength(1);
      expect(tenant!.users[0].role).toBe(Role.ADMIN);
      expect(tenant!.users[0].passwordMustChange).toBe(false);

      const invite = await prisma.tenantInvite.findUnique({ where: { id: create.body.id } });
      expect(invite?.usedAt).toBeTruthy();
      expect(invite?.redeemedTenantId).toBe(tenant!.id);
    });

    it('rejects a second redemption attempt with 400 (single-use)', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      createdInviteIds.push(create.body.id);

      const slug = `single-use-${runSuffix}`;
      createdTenantSlugs.push(slug);
      const first = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Single Use',
          slug,
          adminEmail: 'admin@singleuse.test',
          password: 'strong-pw-123',
        });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Second Attempt',
          slug: `second-${runSuffix}`,
          adminEmail: 'admin@second.test',
          password: 'strong-pw-123',
        });
      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/already been used/i);
    });

    it('rejects redemption of an expired invite', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      createdInviteIds.push(create.body.id);
      await prisma.tenantInvite.update({
        where: { id: create.body.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const res = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Stale',
          slug: `stale-${runSuffix}`,
          adminEmail: 'admin@stale.test',
          password: 'strong-pw-123',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('rejects short passwords', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      createdInviteIds.push(create.body.id);
      const res = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Bad Pw',
          slug: `badpw-${runSuffix}`,
          adminEmail: 'admin@badpw.test',
          password: 'short',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password/i);
    });

    it('rejects duplicate slug', async () => {
      const adminToken = signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform');
      const create = await request(app.getHttpServer())
        .post('/api/tenant-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      createdInviteIds.push(create.body.id);
      const res = await request(app.getHttpServer())
        .post(`/api/tenant-invites/${create.body.token}/redeem`)
        .send({
          companyName: 'Collision',
          slug: `tenant-a-${runSuffix}`, // existing slug
          adminEmail: 'admin@collision.test',
          password: 'strong-pw-123',
        });
      expect(res.status).toBe(409);
    });
  });
});
