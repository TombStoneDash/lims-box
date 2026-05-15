import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Wipe
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

  console.log("Seeded 3 people, 6 competencies, 2 trainings, 2 sign-offs.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
