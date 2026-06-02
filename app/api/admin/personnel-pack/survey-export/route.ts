/**
 * GET /api/admin/personnel-pack/survey-export
 *
 * Returns a ZIP bundle suitable for CLIA on-site survey review containing:
 *  - index.pdf              — summary of all active personnel + status matrix
 *  - personnel/<slug>.pdf   — one detailed PDF per active person
 *
 * Dependencies: pdfkit (already in deps), fflate (pure-JS zip)
 */

import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import { zipSync, strToU8 } from "fflate";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function buildPdf(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  fn(doc);
  doc.end();
  const buf = await done;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ─── Index PDF ───────────────────────────────────────────────────────────────

type PersonWithRelations = Awaited<ReturnType<typeof fetchPeople>>[number];

async function fetchPeople() {
  return prisma.person.findMany({
    where: { active: true },
    include: {
      competencies: { orderBy: { expiresAt: "asc" } },
      trainings: { orderBy: { completedAt: "desc" } },
      signOffs: { orderBy: { signedAt: "desc" } },
      authorizations: {
        where: { isActive: true },
        include: { procedure: true },
        orderBy: { authorizedAt: "desc" },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

function buildIndexPdf(people: PersonWithRelations[], generatedAt: string): Promise<Uint8Array> {
  return buildPdf((doc) => {
    // Title block
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("CLIA Survey-Ready Bundle — Personnel Index");
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666")
      .text(`Generated ${generatedAt}  ·  ${people.length} active personnel`)
      .text(
        "Workflow documentation support. Human-reviewed drafting. " +
          "Confirm completeness before any CMS or accreditation submission.",
      );
    doc.moveDown(1);
    doc.fillColor("#000");

    // Summary table header
    const cols = { name: 54, role: 200, comp: 310, train: 380, signoff: 450, auth: 510 };
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Name", cols.name, doc.y, { continued: false })
    ;
    const headerY = doc.y - doc.currentLineHeight();
    doc.font("Helvetica-Bold").fontSize(8);
    doc.text("Name",    cols.name,   headerY, { lineBreak: false });
    doc.text("Role",    cols.role,   headerY, { lineBreak: false });
    doc.text("Comp",    cols.comp,   headerY, { lineBreak: false });
    doc.text("Train",   cols.train,  headerY, { lineBreak: false });
    doc.text("S-off",   cols.signoff,headerY, { lineBreak: false });
    doc.text("Auth",    cols.auth,   headerY);
    doc
      .moveTo(54, doc.y)
      .lineTo(556, doc.y)
      .strokeColor("#999")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.3);

    // One row per person
    for (const p of people) {
      if (doc.y > 700) doc.addPage();
      const rowY = doc.y;
      doc.font("Helvetica").fontSize(8).fillColor("#000");
      doc.text(p.name,                           cols.name,    rowY, { lineBreak: false, width: 140 });
      doc.text(p.role,                           cols.role,    rowY, { lineBreak: false, width: 105 });
      doc.text(String(p.competencies.length),    cols.comp,    rowY, { lineBreak: false, width: 65 });
      doc.text(String(p.trainings.length),       cols.train,   rowY, { lineBreak: false, width: 65 });
      doc.text(String(p.signOffs.length),        cols.signoff, rowY, { lineBreak: false, width: 55 });
      doc.text(String(p.authorizations.length),  cols.auth,    rowY);
      doc.moveDown(0.1);
    }

    // Legend
    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#555")
      .text("Comp = active competency records  ·  Train = training completions  ·  S-off = director sign-offs  ·  Auth = active procedure authorizations");

    // Table of contents: file list
    doc.moveDown(1.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000")
      .text("Included files in this bundle:");
    doc.font("Helvetica").fontSize(9);
    doc.text("  index.pdf  — this document");
    for (const p of people) {
      doc.text(`  personnel/${slug(p.name)}.pdf  — ${p.name} (${p.role})`);
    }
  });
}

// ─── Per-person PDF ──────────────────────────────────────────────────────────

function buildPersonPdf(p: PersonWithRelations, generatedAt: string): Promise<Uint8Array> {
  return buildPdf((doc) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(p.name);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#444")
      .text(p.role);
    doc
      .fontSize(8)
      .fillColor("#888")
      .text(
        `${p.cliaCertNumber ? "CLIA cert: " + p.cliaCertNumber + "  ·  " : ""}` +
          `Hired: ${fmt(p.hireDate)}  ·  Generated ${generatedAt}`,
      );
    doc.moveDown(0.3);
    doc
      .moveTo(54, doc.y)
      .lineTo(556, doc.y)
      .strokeColor("#ccc")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.6);
    doc.fillColor("#000");

    // ── Competencies ────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(11).text("Competencies");
    doc.moveDown(0.3);
    if (p.competencies.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999").text("  No competency records on file.");
    } else {
      for (const c of p.competencies) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(`  ${c.type}`, { continued: true });
        doc.font("Helvetica").fontSize(9).fillColor("#444").text(`  —  ${c.status}${c.expiresAt ? `  (expires ${fmt(c.expiresAt)})` : ""}`);
        if (c.completedAt) {
          doc.font("Helvetica").fontSize(8).fillColor("#666").text(`      Completed: ${fmt(c.completedAt)}`);
        }
        if (c.notes) {
          doc.font("Helvetica").fontSize(8).fillColor("#555").text(`      Notes: ${c.notes}`);
        }
      }
    }

    // ── Trainings ───────────────────────────────────────────────────────────
    doc.moveDown(0.7);
    doc.fillColor("#000");
    doc.font("Helvetica-Bold").fontSize(11).text("Training Log");
    doc.moveDown(0.3);
    if (p.trainings.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999").text("  No training records on file.");
    } else {
      for (const t of p.trainings) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(`  ${t.course}`, { continued: true });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(`${t.provider ? "  (" + t.provider + ")" : ""}  —  ${fmt(t.completedAt)}${t.hours ? "  · " + t.hours + " hrs" : ""}`);
      }
    }

    // ── Sign-offs ───────────────────────────────────────────────────────────
    doc.moveDown(0.7);
    doc.fillColor("#000");
    doc.font("Helvetica-Bold").fontSize(11).text("Director Sign-offs");
    doc.moveDown(0.3);
    if (p.signOffs.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999").text("  No sign-off records on file.");
    } else {
      for (const s of p.signOffs) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(`  ${s.scope}`, { continued: true });
        doc.font("Helvetica").fontSize(9).fillColor("#444").text(`  —  ${s.directorName}  (${fmt(s.signedAt)})`);
        if (s.notes) {
          doc.font("Helvetica").fontSize(8).fillColor("#555").text(`      Notes: ${s.notes}`);
        }
      }
    }

    // ── Authorizations ──────────────────────────────────────────────────────
    doc.moveDown(0.7);
    doc.fillColor("#000");
    doc.font("Helvetica-Bold").fontSize(11).text("Procedure Authorizations");
    doc.moveDown(0.3);
    const activeAuths = p.authorizations.filter((a) => a.isActive);
    if (activeAuths.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999").text("  No active procedure authorizations.");
    } else {
      for (const a of activeAuths) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000")
          .text(`  ${a.procedure.name}${a.procedure.procedureCode ? " [" + a.procedure.procedureCode + "]" : ""}`, { continued: true });
        doc.font("Helvetica").fontSize(9).fillColor("#444")
          .text(`  —  Authorized by ${a.authorizedBy}  (${fmt(a.authorizedAt)})${a.scope ? "  · " + a.scope : ""}`);
      }
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#aaa")
      .text(
        "LIMS BOX — Workflow documentation support. Human-reviewed drafting. " +
          "This document reflects records in the local database at time of export. " +
          "Confirm completeness before any CMS/accreditation submission.",
        { align: "center" },
      );
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const generatedAt = new Date().toLocaleString("en-US", { timeZoneName: "short" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  const people = await fetchPeople();

  // Build all PDFs in parallel
  const [indexPdf, ...personPdfs] = await Promise.all([
    buildIndexPdf(people, generatedAt),
    ...people.map((p) => buildPersonPdf(p, generatedAt)),
  ]);

  // Assemble ZIP using fflate (sync for simplicity — PDFs already in memory)
  const zipEntries: Record<string, Uint8Array> = {
    "index.pdf": indexPdf,
  };
  for (let i = 0; i < people.length; i++) {
    zipEntries[`personnel/${slug(people[i].name)}.pdf`] = personPdfs[i];
  }

  // Add a plain-text manifest
  const manifest = [
    `CLIA Survey-Ready Bundle`,
    `Generated: ${generatedAt}`,
    `Personnel count: ${people.length}`,
    ``,
    `Files:`,
    `  index.pdf`,
    ...people.map((p) => `  personnel/${slug(p.name)}.pdf  (${p.name} — ${p.role})`),
    ``,
    `Workflow documentation support. Human-reviewed drafting.`,
    `Confirm completeness before any CMS or accreditation submission.`,
  ].join("\n");
  zipEntries["MANIFEST.txt"] = strToU8(manifest);

  const zipBuffer = zipSync(zipEntries, { level: 6 });

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="survey-ready-bundle-${dateSlug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
