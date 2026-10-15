import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { GET as getPersonnelPdf } from "../../app/admin/survey-ready/pdf/route";
import { GET as getSurveyExport } from "../../app/api/admin/personnel-pack/survey-export/route";
import { prisma } from "../../lib/prisma";
import { personnelPaginationFixture as people } from "../fixtures/personnel-pagination";
import { extractPdfText } from "../helpers/pdf";

function pageCount(pdf: Uint8Array): number {
  const source = Buffer.from(pdf).toString("latin1");
  assert.ok(source.startsWith("%PDF-"));
  assert.match(source, /%%EOF\s*$/);
  // PDFKit writes uncompressed page dictionaries (distinct from /Type /Pages).
  const count = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
  const treeCount = source.match(/\/Type\s*\/Pages\b[\s\S]*?\/Count\s+(\d+)/);
  assert.ok(treeCount, "PDF must contain a page tree");
  assert.equal(count, Number(treeCount[1]), "page tree must match emitted pages");
  return count;
}

test("synthetic staff record produces a complete one-page Personnel Pack PDF", { timeout: 15_000 }, async (t) => {
  const person = {
    id: "synthetic-staff-001",
    name: "Avery Example",
    role: "Medical Laboratory Scientist",
    active: true,
    cliaCertNumber: "SYNTHETIC-001",
    hireDate: new Date("2025-01-15T12:00:00Z"),
    competencies: [{
      type: "Synthetic Hematology Assessment",
      status: "COMPETENT",
      completedAt: new Date("2026-02-01T12:00:00Z"),
      expiresAt: new Date("2027-02-01T12:00:00Z"),
      notes: "Synthetic assessment only",
    }],
    trainings: [{
      course: "Synthetic Safety Training",
      provider: "Example Training Lab",
      completedAt: new Date("2026-03-01T12:00:00Z"),
      hours: 2,
    }],
    signOffs: [{
      scope: "Synthetic Hematology Scope",
      directorName: "Dr. Sample Director",
      signedAt: new Date("2026-04-01T12:00:00Z"),
      notes: "Synthetic sign-off only",
    }],
    authorizations: [{
      isActive: true,
      authorizedBy: "Dr. Sample Director",
      authorizedAt: new Date("2026-04-02T12:00:00Z"),
      scope: "Synthetic procedure scope",
      procedure: { name: "Synthetic Blood Count", procedureCode: "SYN-CBC" },
    }],
  };

  // Replace only the database read; both route handlers serialize real PDFs.
  const delegate = prisma.person as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = delegate.findMany;
  let calls = 0;
  delegate.findMany = async () => {
    calls += 1;
    return structuredClone([person]);
  };
  t.after(async () => {
    delegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  const response = await getPersonnelPdf();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") ?? "", /personnel-pack-survey-ready-.*\.pdf/);
  const pdf = new Uint8Array(await response.arrayBuffer());
  assert.equal(pageCount(pdf), 1);
  const text = extractPdfText(pdf).join(" ");
  for (const expected of [
    "Personnel Pack", person.role, person.name, person.cliaCertNumber,
    "Competencies", "Synthetic Hematology Assessment", "COMPETENT",
    "Trainings", "Synthetic Safety Training", "Example Training Lab",
    "Director sign-offs", "Synthetic Hematology Scope", "Dr. Sample Director",
  ]) {
    assert.ok(text.includes(expected), `PDF missing ${expected}`);
  }

  const bundleResponse = await getSurveyExport();
  assert.equal(bundleResponse.status, 200);
  assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
  const entries = unzipSync(new Uint8Array(await bundleResponse.arrayBuffer()));
  assert.deepEqual(Object.keys(entries).sort(), [
    "MANIFEST.txt", "index.pdf", "personnel/avery-example.pdf",
  ]);
  assert.match(strFromU8(entries["MANIFEST.txt"]), /Personnel count: 1\n/);
  assert.equal(pageCount(entries["index.pdf"]), 1);
  const staffPdf = entries["personnel/avery-example.pdf"];
  assert.equal(pageCount(staffPdf), 1);
  const staffText = extractPdfText(staffPdf).join(" ");
  for (const expected of [
    person.name, person.role, "Competencies", "Synthetic Hematology Assessment",
    "Training Log", "Synthetic Safety Training", "Director Sign-offs",
    "Synthetic Hematology Scope", "Procedure Authorizations", "Synthetic Blood Count",
    "SYN-CBC", "Dr. Sample Director",
  ]) {
    assert.ok(staffText.includes(expected), `staff PDF missing ${expected}`);
  }
  assert.equal(calls, 2);
});

for (const kind of ["personnel PDF", "survey ZIP"] as const) {
  test(`${kind} paginates a 70-person roster without losing records`, { timeout: 15_000 }, async (t) => {
    // Stub only storage; exercise the real route and PDFKit serialization.
    const delegate = prisma.person as unknown as {
      findMany: (...args: unknown[]) => Promise<unknown[]>;
    };
    const originalFindMany = delegate.findMany;
    let calls = 0;
    delegate.findMany = async () => {
      calls += 1;
      return structuredClone(people);
    };
    t.after(async () => {
      delegate.findMany = originalFindMany;
      await prisma.$disconnect();
    });

    const response = await (kind === "personnel PDF" ? getPersonnelPdf() : getSurveyExport());
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let pdf = bytes;
    if (kind === "survey ZIP") {
      assert.equal(response.headers.get("content-type"), "application/zip");
      const entries = unzipSync(bytes);
      assert.equal(Object.keys(entries).length, people.length + 2);
      assert.match(strFromU8(entries["MANIFEST.txt"]), /Personnel count: 70\n/);
      for (const person of people) {
        const entry = entries[`personnel/${person.name.toLowerCase().replaceAll(" ", "-")}.pdf`];
        assert.ok(entry, `missing PDF for ${person.name}`);
        assert.equal(pageCount(entry), 1);
        assert.equal(extractPdfText(entry).filter((line) => line === person.name).length, 1);
      }
      pdf = entries["index.pdf"];
    } else {
      assert.equal(response.headers.get("content-type"), "application/pdf");
    }

    const count = pageCount(pdf);
    assert.ok(count >= 2, `expected pagination, got ${count} page(s)`);
    assert.equal(count, kind === "personnel PDF" ? 11 : 10);
    // Full-line names count actual roster rows, excluding index file-list entries.
    const names = extractPdfText(pdf).filter((line) => /^Fixture Person \d{3}$/.test(line));
    assert.equal(names.length, 70);
    assert.deepEqual(names, people.map((person) => person.name));
  });
}
