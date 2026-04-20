import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { LLMProvider, Role } from '@rfp-pulse/db';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

describe('Tenant + user management (Step 7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformTenantId: string;
  let tenantAId: string;
  let tenantBId: string;
  let superAdminId: string;
  let adminAId: string;
  let readOnlyAId: string;
  let adminBId: string;
  const runSuffix = `step7-${Date.now()}`;
  const createdTenantSlugs: string[] = [];

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
    const tenantB = await prisma.tenant.create({
      data: { name: 'Tenant B', slug: `tenant-b-${runSuffix}` },
    });
    tenantBId = tenantB.id;

    const passwordHash = hashSync('password123', 10);

    const superAdmin = await prisma.user.create({
      data: {
        tenantId: platformTenantId,
        email: 'super@step7.test',
        role: Role.SUPER_ADMIN,
        passwordHash,
      },
    });
    superAdminId = superAdmin.id;

    const adminA = await prisma.user.create({
      data: { tenantId: tenantAId, email: 'admin@a.test', role: Role.ADMIN, passwordHash },
    });
    adminAId = adminA.id;
    const readOnlyA = await prisma.user.create({
      data: { tenantId: tenantAId, email: 'ro@a.test', role: Role.READ_ONLY, passwordHash },
    });
    readOnlyAId = readOnlyA.id;
    const adminB = await prisma.user.create({
      data: { tenantId: tenantBId, email: 'admin@b.test', role: Role.ADMIN, passwordHash },
    });
    adminBId = adminB.id;
  });

  afterAll(async () => {
    for (const slug of createdTenantSlugs) {
      const t = await prisma.tenant.findUnique({ where: { slug } });
      if (t) {
        await prisma.user.deleteMany({ where: { tenantId: t.id } });
        await prisma.tenant.delete({ where: { id: t.id } });
      }
    }
    for (const id of [tenantAId, tenantBId, platformTenantId]) {
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await app.close();
  });

  describe('POST /api/tenants (SUPER_ADMIN)', () => {
    it('rejects non-SUPER_ADMIN with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({
          name: 'Nope',
          slug: `nope-${runSuffix}`,
          adminEmail: 'x@nope.test',
        })
        .expect(403);
    });

    it('rejects READ_ONLY with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(readOnlyAId, Role.READ_ONLY, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({})
        .expect(403);
    });

    it('creates tenant + initial ADMIN with temp password', async () => {
      const slug = `new-co-${runSuffix}`;
      createdTenantSlugs.push(slug);
      const res = await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform')}`,
        )
        .send({
          name: 'New Company',
          slug,
          adminEmail: 'FOUNDER@NewCo.Test',
          adminName: 'Nova Founder',
          defaultProvider: 'claude',
        })
        .expect(201);

      expect(res.body.tenant).toMatchObject({
        name: 'New Company',
        slug,
        defaultProvider: 'CLAUDE',
      });
      expect(res.body.initialAdmin.email).toBe('founder@newco.test');
      expect(res.body.tempPassword).toMatch(/^[A-Za-z0-9]{12,}$/);

      const dbUser = await prisma.user.findFirstOrThrow({
        where: { email: 'founder@newco.test' },
      });
      expect(dbUser.role).toBe(Role.ADMIN);
      expect(dbUser.passwordMustChange).toBe(true);
      expect(dbUser.passwordHash).toBeTruthy();
      expect(dbUser.passwordHash).not.toBe(res.body.tempPassword);
    });

    it('400s on invalid slug', async () => {
      await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform')}`,
        )
        .send({ name: 'Bad', slug: 'BAD SLUG!', adminEmail: 'x@y.test' })
        .expect(400);
    });

    it('409s on duplicate slug', async () => {
      const slug = `dup-${runSuffix}`;
      createdTenantSlugs.push(slug);
      await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform')}`,
        )
        .send({ name: 'Dup', slug, adminEmail: 'a@a.test' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/tenants')
        .set(
          'Authorization',
          `Bearer ${signToken(superAdminId, Role.SUPER_ADMIN, platformTenantId, 'platform')}`,
        )
        .send({ name: 'Dup2', slug, adminEmail: 'b@b.test' })
        .expect(409);
    });
  });

  describe('PATCH /api/tenants/me (ADMIN)', () => {
    it('ADMIN updates default LLM provider', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/me')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ defaultProvider: 'gemini' })
        .expect(200);
      expect(res.body.defaultProvider).toBe('GEMINI');

      const row = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantAId } });
      expect(row.defaultProvider).toBe(LLMProvider.GEMINI);
    });

    it('READ_ONLY cannot update tenant settings (403)', async () => {
      await request(app.getHttpServer())
        .patch('/api/tenants/me')
        .set(
          'Authorization',
          `Bearer ${signToken(readOnlyAId, Role.READ_ONLY, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ defaultProvider: 'openai' })
        .expect(403);
    });

    it('400s on invalid provider', async () => {
      await request(app.getHttpServer())
        .patch('/api/tenants/me')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ defaultProvider: 'nonsense' })
        .expect(400);
    });
  });

  describe('POST /api/users (ADMIN invite)', () => {
    it('ADMIN invites user; receives temp password; user must change on login', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ email: 'invitee@a.test', name: 'Invitee', role: 'SME' })
        .expect(201);
      expect(res.body.user).toMatchObject({
        email: 'invitee@a.test',
        role: 'SME',
        passwordMustChange: true,
      });
      expect(res.body.tempPassword).toMatch(/^[A-Za-z0-9]{12,}$/);
    });

    it('rejects READ_ONLY with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set(
          'Authorization',
          `Bearer ${signToken(readOnlyAId, Role.READ_ONLY, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ email: 'no@a.test', role: 'SME' })
        .expect(403);
    });

    it('409 on duplicate email in same tenant', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ email: 'admin@a.test', role: 'SME' })
        .expect(409);
    });

    it('400 when role is SUPER_ADMIN', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ email: 'superbad@a.test', role: 'SUPER_ADMIN' })
        .expect(400);
    });
  });

  describe('GET /api/users (tenant scoping)', () => {
    it('returns only users in the caller tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .expect(200);
      const emails = (res.body.users as Array<{ email: string }>).map((u) => u.email);
      expect(emails).toContain('admin@a.test');
      expect(emails).toContain('ro@a.test');
      expect(emails).not.toContain('admin@b.test');
    });
  });

  describe('PATCH /api/users/:id (role edit)', () => {
    it('ADMIN cannot edit a user in another tenant (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${adminBId}`)
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ role: 'SME' })
        .expect(403);
    });

    it('ADMIN cannot change own role (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${adminAId}`)
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ role: 'READ_ONLY' })
        .expect(400);
    });

    it('ADMIN updates a role in their tenant', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${readOnlyAId}`)
        .set(
          'Authorization',
          `Bearer ${signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`)}`,
        )
        .send({ role: 'SME' })
        .expect(200);
      expect(res.body.role).toBe('SME');
    });
  });

  describe('POST /api/account/change-password', () => {
    it('clears passwordMustChange after successful change', async () => {
      // Create a fresh invitee so the test is hermetic.
      const tempHash = hashSync('OldTemp123!', 10);
      const invitee = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: 'mustchange@a.test',
          role: Role.SME,
          passwordHash: tempHash,
          passwordMustChange: true,
        },
      });
      const token = signToken(invitee.id, Role.SME, tenantAId, `tenant-a-${runSuffix}`);

      await request(app.getHttpServer())
        .post('/api/account/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldTemp123!', newPassword: 'MyNewPassword!' })
        .expect(201);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: invitee.id } });
      expect(row.passwordMustChange).toBe(false);
    });

    it('401 on wrong current password', async () => {
      const token = signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`);
      await request(app.getHttpServer())
        .post('/api/account/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong', newPassword: 'anotherlongpassword' })
        .expect(401);
    });

    it('400 on too-short new password', async () => {
      const token = signToken(adminAId, Role.ADMIN, tenantAId, `tenant-a-${runSuffix}`);
      await request(app.getHttpServer())
        .post('/api/account/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123', newPassword: 'short' })
        .expect(400);
    });
  });
});
