/**
 * Seed the local database with a demo tenant, admin + SME + read-only users, a
 * handful of RFP projects, questions (some assigned to the admin user so the
 * Step 5 SME task list is non-empty), and a few knowledge-base stubs. Safe to
 * re-run (uses upserts / find-first + create). Passwords are hashed with bcrypt
 * so NextAuth can authenticate them out of the box.
 *
 * Usage: `pnpm db:seed` from the repo root.
 */
import { hashSync } from 'bcryptjs';

import { PrismaClient, RFPStatus, Role, WorkflowState } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Proposals', slug: 'acme' },
  });

  // Platform tenant hosts the SUPER_ADMIN user who can provision tenants.
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: {},
    create: { name: 'RFP Pulse Platform', slug: 'platform' },
  });

  const passwordHash = hashSync(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const superAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: platformTenant.id, email: 'super@rfp-pulse.test' } },
    update: { role: Role.SUPER_ADMIN, passwordHash, passwordMustChange: false },
    create: {
      tenantId: platformTenant.id,
      email: 'super@rfp-pulse.test',
      name: 'Sam Super-Admin',
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@acme.test' } },
    update: { role: Role.ADMIN, passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'admin@acme.test',
      name: 'Ada Admin',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const readOnly = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'readonly@acme.test' } },
    update: { role: Role.READ_ONLY, passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'readonly@acme.test',
      name: 'Rory Read-Only',
      passwordHash,
      role: Role.READ_ONLY,
    },
  });

  const projects = await Promise.all([
    upsertProject(tenant.id, 'Demo RFP: Cloud Modernization', 'Globex Corp', 14),
    upsertProject(tenant.id, 'Demo RFP: Data Platform Rebuild', 'Initech', 30),
    upsertProject(tenant.id, 'Demo RFP: Zero-Trust Security Overhaul', 'Umbrella Analytics', 45),
  ]);
  const proposalProjects = await Promise.all([
    upsertProject(
      tenant.id,
      'Demo Proposal: Statewide Digital Services',
      'City of Springfield',
      -5,
      RFPStatus.SUBMITTED,
    ),
    upsertProject(
      tenant.id,
      'Demo Proposal: Claims Automation Platform',
      'Beacon Insurance Group',
      -20,
      RFPStatus.WON,
    ),
    upsertProject(
      tenant.id,
      'Demo Proposal: Public Transit Operations Suite',
      'Metro Transit Authority',
      -35,
      RFPStatus.LOST,
    ),
  ]);

  const questionsByProject: Array<{ title: string; questions: string[] }> = [
    {
      title: 'Demo RFP: Cloud Modernization',
      questions: [
        'Describe your approach to multi-tenant data isolation in a SaaS platform.',
        'Outline your disaster recovery RTO/RPO targets for a production workload.',
        'How do you handle zero-downtime database migrations at scale?',
      ],
    },
    {
      title: 'Demo RFP: Data Platform Rebuild',
      questions: [
        'Explain your lakehouse architecture and how you separate compute from storage.',
        'What is your approach to PII discovery and classification across the data estate?',
      ],
    },
    {
      title: 'Demo RFP: Zero-Trust Security Overhaul',
      questions: [
        'Describe your strategy for continuous authentication and device posture checks.',
        'How do you manage secrets rotation and short-lived credentials across microservices?',
      ],
    },
  ];

  for (const group of questionsByProject) {
    const project = projects.find((p) => p.title === group.title);
    if (!project) continue;
    for (const text of group.questions) {
      const existing = await prisma.rFPQuestion.findFirst({
        where: { projectId: project.id, questionText: text },
      });
      if (existing) continue;
      await prisma.rFPQuestion.create({
        data: {
          tenantId: tenant.id,
          projectId: project.id,
          questionText: text,
          sectionPath: 'Section / Technical',
          // Assign to the admin user so the SME task list has content when the
          // demo logs in as admin@acme.test.
          assignedSmeId: admin.id,
        },
      });
    }
  }

  const proposalSeeds: Array<{
    title: string;
    entries: Array<{ questionText: string; answer: string }>;
  }> = [
    {
      title: 'Demo Proposal: Statewide Digital Services',
      entries: [
        {
          questionText: 'Provide your implementation approach and rollout timeline.',
          answer:
            'We propose a phased 16-week rollout with discovery, pilot, and statewide launch phases. Each phase includes acceptance criteria, training, and a transition-to-operations checkpoint.',
        },
        {
          questionText: 'Describe your SLA commitments and support model.',
          answer:
            'Our managed support model includes 24x7 critical incident coverage, a 99.9% uptime SLA, and monthly service review reports with corrective action tracking.',
        },
      ],
    },
    {
      title: 'Demo Proposal: Claims Automation Platform',
      entries: [
        {
          questionText: 'How will your platform improve claims turnaround time?',
          answer:
            'Using automated intake triage and rules-based adjudication, we project a 32% reduction in average turnaround within the first two quarters post go-live.',
        },
        {
          questionText: 'Explain your security and compliance posture.',
          answer:
            'The platform enforces encryption in transit and at rest, role-based access controls, and complete audit logging aligned with SOC 2 and ISO 27001 control expectations.',
        },
      ],
    },
    {
      title: 'Demo Proposal: Public Transit Operations Suite',
      entries: [
        {
          questionText: 'Outline your integration strategy with legacy transit systems.',
          answer:
            'Our approach uses an API gateway with adapter services for dispatch, fare, and telemetry systems. We stage integrations by route group to minimize service disruption risk.',
        },
        {
          questionText: 'Describe your change-management and training plan.',
          answer:
            'We deliver role-based onboarding paths for dispatchers, supervisors, and maintenance teams, plus on-site hypercare for the first 30 operational days.',
        },
      ],
    },
  ];

  for (const proposal of proposalSeeds) {
    const project = proposalProjects.find((p) => p.title === proposal.title);
    if (!project) continue;

    for (const entry of proposal.entries) {
      const existingQuestion = await prisma.rFPQuestion.findFirst({
        where: { projectId: project.id, questionText: entry.questionText },
      });

      const question = existingQuestion
        ? await prisma.rFPQuestion.update({
            where: { id: existingQuestion.id },
            data: {
              sectionPath: 'Proposal / Response',
              isSelected: true,
              assignedSmeId: admin.id,
            },
          })
        : await prisma.rFPQuestion.create({
            data: {
              tenantId: tenant.id,
              projectId: project.id,
              questionText: entry.questionText,
              sectionPath: 'Proposal / Response',
              isSelected: true,
              assignedSmeId: admin.id,
            },
          });

      const existingAnswer = await prisma.rFPAnswer.findFirst({
        where: { questionId: question.id },
      });

      if (existingAnswer) {
        await prisma.rFPAnswer.update({
          where: { id: existingAnswer.id },
          data: {
            content: entry.answer,
            state: WorkflowState.APPROVED,
            authorId: admin.id,
          },
        });
      } else {
        await prisma.rFPAnswer.create({
          data: {
            tenantId: tenant.id,
            questionId: question.id,
            content: entry.answer,
            state: WorkflowState.APPROVED,
            authorId: admin.id,
          },
        });
      }
    }
  }

  // Seed a starter draft on the first question of the first project so the
  // Step 5 dashboard renders a non-empty "Drafting" badge before any Draft
  // Response click. Other questions intentionally have no answer row so the
  // RAG pipeline has something to generate.
  const firstProject = projects[0];
  if (firstProject) {
    const firstQuestion = await prisma.rFPQuestion.findFirst({
      where: { projectId: firstProject.id },
      orderBy: { createdAt: 'asc' },
    });
    if (firstQuestion) {
      const existingAnswer = await prisma.rFPAnswer.findFirst({
        where: { questionId: firstQuestion.id },
      });
      if (!existingAnswer) {
        await prisma.rFPAnswer.create({
          data: {
            tenantId: tenant.id,
            questionId: firstQuestion.id,
            content:
              'Placeholder draft. Click "Draft Response" to regenerate via the Step 3 RAG pipeline.',
            state: WorkflowState.DRAFTING,
            authorId: admin.id,
          },
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant.id, slug: tenant.slug },
        platformTenant: { id: platformTenant.id, slug: platformTenant.slug },
        superAdmin: { id: superAdmin.id, email: superAdmin.email, role: superAdmin.role },
        admin: { id: admin.id, email: admin.email, role: admin.role },
        readOnly: { id: readOnly.id, email: readOnly.email, role: readOnly.role },
        projects: projects.map((p) => ({ id: p.id, title: p.title })),
        proposalProjects: proposalProjects.map((p) => ({ id: p.id, title: p.title })),
        credentials: { password: DEMO_PASSWORD, note: 'dev-only; rotate in real deploys' },
      },
      null,
      2,
    ),
  );
}

async function upsertProject(
  tenantId: string,
  title: string,
  clientName: string,
  dueInDays: number,
  status: RFPStatus = RFPStatus.DRAFT,
) {
  const existing = await prisma.rFPProject.findFirst({ where: { tenantId, title } });
  const dueAt = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
  if (existing) {
    return prisma.rFPProject.update({
      where: { id: existing.id },
      data: { clientName, dueAt, status },
    });
  }
  return prisma.rFPProject.create({
    data: {
      tenantId,
      title,
      clientName,
      dueAt,
      status,
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
