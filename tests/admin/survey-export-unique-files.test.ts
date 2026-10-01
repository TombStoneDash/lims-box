import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { buildPersonnelFileNames, GET } from "../../app/api/admin/personnel-pack/survey-export/route";
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

  // Colliding names get an id-derived tag; the unique (non-ASCII) name keeps its plain file name.
  assert.ok(!("personnel/maria-garcia.pdf" in entries));
  assert.ok(entries["personnel/person.pdf"], "the one name with no ASCII letters keeps personnel/person.pdf");
  const mariaFiles = personnelNames.filter((name) => /^personnel\/maria-garcia-[0-9a-f]{8}\.pdf$/.test(name));
  const anneFiles = personnelNames.filter((name) => /^personnel\/anne-marie-o-neil-[0-9a-f]{8}\.pdf$/.test(name));
  assert.equal(mariaFiles.length, 2);
  assert.equal(anneFiles.length, 2);

  // Each synthetic person has a unique training course, so the course inside a PDF identifies whose file it is.
  const courses = ["COURSE-SUPERVISOR", "COURSE-TECHNOLOGIST", "COURSE-ANNE-MARIE-HYPHEN", "COURSE-ANNE-MARIE-SPACE", "COURSE-NO-ASCII"];
  const personIn = (files: Record<string, Uint8Array>, name: string) => {
    const text = extractPdfText(files[name]).join("");
    const found = courses.filter((course) => text.includes(course));
    assert.equal(found.length, 1, `${name} must hold exactly one person`);
    return found[0];
  };
  const personByFile = Object.fromEntries(personnelNames.map((name) => [name, personIn(entries, name)]));
  assert.deepEqual(Object.values(personByFile).sort(), [...courses].sort(), "every person has exactly one file");

  // Stable per person: the same people in reverse order (and shuffled) keep exactly the same file for every person.
  for (const order of [[...people].reverse(), [people[2], people[0], people[4], people[1], people[3]]]) {
    delegate.findMany = async () => order;
    const again = unzipSync(new Uint8Array(await (await GET()).arrayBuffer()));
    const againPersonnel = Object.keys(again).filter((name) => name.startsWith("personnel/")).sort();
    assert.deepEqual(againPersonnel, [...personnelNames].sort());
    for (const name of personnelNames) {
      assert.equal(personIn(again, name), personByFile[name], `${name} must hold the same person in every order`);
    }
  }
  delegate.findMany = async () => people;

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

test("a name that equals another person's tagged file name resolves the same way in every order", async (t) => {
  const delegate = prisma.person as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = delegate.findMany;
  t.after(async () => {
    delegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  // "Maria Garcia <tag of demo-person-001>" slugs to exactly the tagged file name of the first Maria Garcia.
  const tag = createHash("sha256").update("demo-person-001").digest("hex").slice(0, 8);
  const clash = makePerson({ id: "demo-person-006", name: `Maria Garcia ${tag}`, role: "Clerk", trainingCourse: "COURSE-CLASH" });
  const all = [...people, clash];
  const courses = ["COURSE-SUPERVISOR", "COURSE-TECHNOLOGIST", "COURSE-ANNE-MARIE-HYPHEN", "COURSE-ANNE-MARIE-SPACE", "COURSE-NO-ASCII", "COURSE-CLASH"];

  const exportMap = async (order: unknown[]) => {
    delegate.findMany = async () => order;
    const files = unzipSync(new Uint8Array(await (await GET()).arrayBuffer()));
    const map: Record<string, string> = {};
    for (const name of Object.keys(files).filter((n) => n.startsWith("personnel/"))) {
      const text = extractPdfText(files[name]).join("");
      const found = courses.filter((course) => text.includes(course));
      assert.equal(found.length, 1, `${name} must hold exactly one person`);
      map[name] = found[0];
    }
    return map;
  };

  const first = await exportMap(all);
  assert.equal(Object.keys(first).length, 6, "six people, six files");
  assert.deepEqual(Object.values(first).sort(), [...courses].sort());
  assert.deepEqual(await exportMap([...all].reverse()), first);
  assert.deepEqual(await exportMap([all[5], all[3], all[0], all[4], all[1], all[2]]), first);
});

test("file naming always terminates, even when crafted names take every tag length", () => {
  // Two real collisions on "x" plus names occupying the tagged candidate at every tag length (8, 12, ... 64)
  // for the id that sorts last, so its whole tag ladder is taken and only the counter fallback is left.
  const full = createHash("sha256").update("id-b").digest("hex");
  const squatters = [];
  for (let length = 8; length <= 64; length += 4) {
    squatters.push({ id: `id-a-${String(length).padStart(2, "0")}`, name: `x ${full.slice(0, length)}` });
  }
  const people = [{ id: "id-b", name: "x" }, { id: "id-a", name: "x" }, ...squatters];
  const names = buildPersonnelFileNames(people);
  assert.equal(names.length, people.length);
  assert.equal(new Set(names).size, people.length, "every person gets a distinct file name");
  assert.equal(names[0], `personnel/x-${full}-2.pdf`, "the last id falls back to the counter");
  assert.deepEqual(buildPersonnelFileNames([...people].reverse()), [...names].reverse(), "same names in any order");
});
