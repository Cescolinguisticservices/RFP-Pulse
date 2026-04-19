/**
 * Seed the local database with a demo tenant, an admin user, and a dummy RFP
 * project. Safe to re-run (uses upserts).
 *
 * Usage: `pnpm db:seed` from the repo root.
 */
import { PrismaClient, Role, WorkflowState } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(pw: string): string {
  // Placeholder hash for seed data only. Real auth in Step 2 uses bcrypt/NextAuth.
  return createHash('sha256').update(pw).digest('hex');
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Proposals',
      slug: 'acme',
    },
  });

  const admin = await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: 'admin@acme.test' },
    },
    update: { role: Role.ADMIN },
    create: {
      tenantId: tenant.id,
      email: 'admin@acme.test',
      name: 'Ada Admin',
      passwordHash: hashPassword('password123'),
      role: Role.ADMIN,
    },
  });

  const existingProject = await prisma.rFPProject.findFirst({
    where: { tenantId: tenant.id, title: 'Demo RFP: Cloud Modernization' },
  });

  const project =
    existingProject ??
    (await prisma.rFPProject.create({
      data: {
        tenantId: tenant.id,
        title: 'Demo RFP: Cloud Modernization',
        clientName: 'Globex Corp',
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }));

  const existingQuestion = await prisma.rFPQuestion.findFirst({
    where: { projectId: project.id, questionText: { startsWith: 'Describe your approach' } },
  });

  const question =
    existingQuestion ??
    (await prisma.rFPQuestion.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        questionText: 'Describe your approach to multi-tenant data isolation in a SaaS platform.',
        sectionPath: 'Section 3 / Security',
      },
    }));

  const existingAnswer = await prisma.rFPAnswer.findFirst({
    where: { questionId: question.id },
  });

  if (!existingAnswer) {
    await prisma.rFPAnswer.create({
      data: {
        tenantId: tenant.id,
        questionId: question.id,
        content: 'Placeholder draft. Will be replaced by the RAG pipeline once Step 3 is complete.',
        state: WorkflowState.DRAFTING,
        authorId: admin.id,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant.id, slug: tenant.slug },
        admin: { id: admin.id, email: admin.email, role: admin.role },
        project: { id: project.id, title: project.title },
        question: { id: question.id },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
