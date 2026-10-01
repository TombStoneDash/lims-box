import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { GET } from "../../app/api/admin/personnel-pack/survey-export/route";
import { prisma } from "../../lib/prisma";
import { extractPdfText } from "../helpers/pdf";

// Synthetic person shape mirrors tests/fixtures/survey-export.golden.json —
// no real person, laboratory, certificate, or procedure is represented.
function makePerson(opts: {
  id: string;
  name: string;
  role: string;
  trainingCourse: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    role: opts.role,
    cliaCertNumber: "NOT-A-REAL-CERT",
    hireDate: new Date("2024-01-15T00:00:00.000Z"),
    active: true,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    competencies: [] as unknown[],
    trainings: [
      {
        id: `${opts.id}-training-001`,
        personId: opts.id,
        course: opts.trainingCourse,
        provider: null,
        completedAt: new Date("2024-02-02T00:00:00.000Z"),
        hours: null,
        certificate: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ],
    signOffs: [] as unknown[],
    authorizations: [] as unknown[],
  };
}

const people = [
  makePerson({
    id: "demo-person-001",
    name: "Maria Garcia",
    role: "Supervisor",
    trainingCourse: "COURSE-SUPERVISOR",
  }),
  makePerson({
    id: "demo-person-002",
    name: "Maria Garcia",
    role: "Technologist",
    trainingCourse: "COURSE-TECHNOLOGIST",
  }),
  makePerson({
    id: "demo-person-003",
    name: "Anne-Marie O'Neil",
    role: "Technologist",
    trainingCourse: "COURSE-ANNE-MARIE-HYPHEN",
  }),
  makePerson({
    id: "demo-person-004",
    name: "Anne Marie O Neil",
    role: "Technologist",
    trainingCourse: "COURSE-ANNE-MARIE-SPACE",
  }),
  makePerson({
    id: "demo-person-005",
    name: "王伟",
    role: "Technologist",
    trainingCourse: "COURSE-NO-ASCII",
  }),
];

test("survey export gives every active person a distinct personnel file, even when names collide", async (t) => {
  const delegate = prisma.person as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = delegate.findMany;

  delegate.findMany = async () => people;

  t.after(async () => {
    delegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  const response = await GET();
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  const entries = unzipSync(zipBytes);

  const personnelNames = Object.keys(entries).filter((name) =>
    name.startsWith("personnel/"),
  );
  assert.equal(personnelNames.length, 5);
  assert.ok(!("personnel/.pdf" in entries));

  assert.ok(entries["personnel/maria-garcia.pdf"]);
  assert.ok(entries["personnel/maria-garcia-2.pdf"]);

  const firstMariaText = extractPdfText(entries["personnel/maria-garcia.pdf"]);
  const secondMariaText = extractPdfText(entries["personnel/maria-garcia-2.pdf"]);
  const firstHasSupervisor = firstMariaText.some((line) =>
    line.includes("COURSE-SUPERVISOR"),
  );
  const secondHasSupervisor = secondMariaText.some((line) =>
    line.includes("COURSE-SUPERVISOR"),
  );
  const firstHasTechnologist = firstMariaText.some((line) =>
    line.includes("COURSE-TECHNOLOGIST"),
  );
  const secondHasTechnologist = secondMariaText.some((line) =>
    line.includes("COURSE-TECHNOLOGIST"),
  );
  assert.ok(
    (firstHasSupervisor && secondHasTechnologist) ||
      (secondHasSupervisor && firstHasTechnologist),
    "the two Maria Garcia files must contain the two distinct training courses",
  );

  const manifest = strFromU8(entries["MANIFEST.txt"]);
  const manifestPersonnelPaths = Array.from(
    manifest.matchAll(/personnel\/[^\s]+\.pdf/g),
    (m) => m[0],
  );
  assert.equal(manifestPersonnelPaths.length, 5);
  for (const manifestPath of manifestPersonnelPaths) {
    assert.ok(
      entries[manifestPath],
      `MANIFEST.txt references ${manifestPath}, which is not a ZIP entry`,
    );
  }
  assert.deepEqual(
    [...manifestPersonnelPaths].sort(),
    [...new Set(manifestPersonnelPaths)].sort(),
    "every personnel path must appear exactly once in MANIFEST.txt",
  );

  // PDFKit line-wraps long text at hyphens/slashes, so join the extracted
  // lines with no separator to reconstruct unbroken file names (see the
  // golden fixture's "personnel/" / "demo-" / "analyst-" / "one.pdf —" split).
  const indexTextJoined = extractPdfText(entries["index.pdf"]).join("");
  for (const name of personnelNames) {
    assert.ok(
      indexTextJoined.includes(name),
      `index.pdf should list the file name "${name}"`,
    );
  }
});
