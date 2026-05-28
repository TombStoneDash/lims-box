import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Wipe
  await prisma.personnelPackAuthorization.deleteMany();
  await prisma.personnelPackReviewEvent.deleteMany();
  await prisma.personnelPackDocumentVersion.deleteMany();
  await prisma.personnelPackDocument.deleteMany();
  await prisma.signOff.deleteMany();
  await prisma.training.deleteMany();
  await prisma.competency.deleteMany();
  await prisma.person.deleteMany();

  const now = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  // Person 1 — up to date
  const alice = await prisma.person.create({
    data: {
      name: "Alice Chen",
      role: "MT (Medical Technologist)",
      cliaCertNumber: "ASCP-MT-204781",
      hireDate: new Date("2021-03-15"),
      active: true,
    },
  });
  await prisma.competency.createMany({
    data: [
      {
        personId: alice.id,
        type: "Direct Observation",
        status: "completed",
        completedAt: daysFromNow(-90),
        expiresAt: daysFromNow(275),
      },
      {
        personId: alice.id,
        type: "Sample Re-test",
        status: "completed",
        completedAt: daysFromNow(-60),
        expiresAt: daysFromNow(305),
      },
    ],
  });
  await prisma.training.create({
    data: {
      personId: alice.id,
      course: "Hematology Annual Refresher",
      provider: "ASCP",
      completedAt: daysFromNow(-120),
      hours: 4.0,
    },
  });
  await prisma.signOff.create({
    data: {
      personId: alice.id,
      directorName: "Dr. Robert Kim, MD",
      signedAt: daysFromNow(-90),
      scope: "Annual re-competency",
    },
  });

  // Person 2 — due soon (14 days)
  const ben = await prisma.person.create({
    data: {
      name: "Ben Ortiz",
      role: "MLT (Medical Laboratory Technician)",
      cliaCertNumber: "AMT-MLT-118293",
      hireDate: new Date("2023-08-01"),
      active: true,
    },
  });
  await prisma.competency.createMany({
    data: [
      {
        personId: ben.id,
        type: "Direct Observation",
        status: "due",
        expiresAt: daysFromNow(14),
        notes: "Due before next CMS look-back window.",
      },
      {
        personId: ben.id,
        type: "QC Review",
        status: "completed",
        completedAt: daysFromNow(-30),
        expiresAt: daysFromNow(335),
      },
    ],
  });
  await prisma.training.create({
    data: {
      personId: ben.id,
      course: "Phlebotomy Recertification",
      provider: "NHA",
      completedAt: daysFromNow(-180),
      hours: 6.0,
    },
  });

  // Person 3 — overdue
  const carla = await prisma.person.create({
    data: {
      name: "Carla Nguyen",
      role: "Lab Director",
      cliaCertNumber: "ABMS-PATH-009431",
      hireDate: new Date("2019-01-10"),
      active: true,
    },
  });
  await prisma.competency.createMany({
    data: [
      {
        personId: carla.id,
        type: "Problem Solving",
        status: "overdue",
        expiresAt: daysFromNow(-21),
        notes: "Overdue 21 days. Schedule with director.",
      },
      {
        personId: carla.id,
        type: "Maintenance",
        status: "completed",
        completedAt: daysFromNow(-45),
        expiresAt: daysFromNow(320),
      },
    ],
  });
  await prisma.signOff.create({
    data: {
      personId: carla.id,
      directorName: "Self (Lab Director)",
      signedAt: daysFromNow(-365),
      scope: "Initial competency",
    },
  });

  const hematologyProcedure = await prisma.personnelPackDocument.create({
    data: {
      title: "Hematology Analyzer Operation",
      code: "HEM-SOP-001",
      kind: "procedure",
      description: "Primary operating procedure for CBC workflow.",
    },
  });

  await prisma.personnelPackDocumentVersion.createMany({
    data: [
      {
        documentId: hematologyProcedure.id,
        versionNumber: "1.0",
        effectiveDate: new Date("2025-01-15"),
        supersededDate: new Date("2026-03-01"),
        revisionSummary: "Initial release of analyzer startup and QC workflow.",
        approvedBy: "Dr. Robert Kim, MD",
        approvedAt: new Date("2025-01-15"),
        documentContentUrl: "/uploads/hem-sop-001-v1.pdf",
      },
      {
        documentId: hematologyProcedure.id,
        versionNumber: "1.1",
        effectiveDate: new Date("2026-03-01"),
        revisionSummary: "Clarified delta check escalation and maintenance sign-off.",
        approvedBy: "Dr. Robert Kim, MD",
        approvedAt: new Date("2026-03-01"),
        documentContentUrl: "/uploads/hem-sop-001-v1-1.pdf",
      },
    ],
  });

  const competencyForm = await prisma.personnelPackDocument.create({
    data: {
      title: "Annual Competency Assessment Form",
      code: "QA-FRM-014",
      kind: "form",
      description: "Controlled competency checklist for annual review packets.",
    },
  });

  await prisma.personnelPackDocumentVersion.create({
    data: {
      documentId: competencyForm.id,
      versionNumber: "2.0",
      effectiveDate: new Date("2026-01-05"),
      revisionSummary: "Aligned form with ISO 15189 review annotations.",
      approvedBy: "Carla Nguyen",
      approvedAt: new Date("2026-01-05"),
      documentContentUrl: "/uploads/qa-frm-014-v2.pdf",
    },
  });

  await prisma.personnelPackAuthorization.createMany({
    data: [
      {
        personId: alice.id,
        documentId: hematologyProcedure.id,
        authorizedAt: daysFromNow(-75),
        authorizedBy: "Dr. Robert Kim, MD",
        scope: "All shifts",
      },
      {
        personId: ben.id,
        documentId: hematologyProcedure.id,
        authorizedAt: daysFromNow(-20),
        authorizedBy: "Dr. Robert Kim, MD",
        scope: "Day shift only",
      },
    ],
  });

  const benDueDate = daysFromNow(14);
  const benReviewDate = new Date(benDueDate);
  benReviewDate.setDate(benReviewDate.getDate() - 14);
  const benDirectObservation = await prisma.competency.findFirstOrThrow({
    where: { personId: ben.id, type: "Direct Observation" },
  });
  await prisma.personnelPackReviewEvent.create({
    data: {
      competencyRecordId: benDirectObservation.id,
      reviewerName: "Carla Nguyen",
      reviewerRole: "section supervisor",
      reviewType: "six_month",
      reviewOutcome: "requires_remediation",
      notes: "Needs repeat observed run on abnormal differential workflow.",
      correctiveActionRequired: true,
      correctiveActionSummary: "Schedule supervised repeat competency and document follow-up training.",
      nextReviewDue: benDueDate,
      reviewedAt: benReviewDate,
    },
  });

  const aliceCompetency = await prisma.competency.findFirstOrThrow({
    where: { personId: alice.id, type: "Direct Observation" },
  });
  await prisma.personnelPackReviewEvent.create({
    data: {
      competencyRecordId: aliceCompetency.id,
      reviewerName: "Carla Nguyen",
      reviewerRole: "QA officer",
      reviewType: "annual",
      reviewOutcome: "competent",
      notes: "Annual review complete with no gaps.",
      nextReviewDue: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      reviewedAt: daysFromNow(-30),
    },
  });

  console.log("Seeded personnel pack v1 data plus ISO 15189 v1.5 documents, reviews, and authorizations.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
