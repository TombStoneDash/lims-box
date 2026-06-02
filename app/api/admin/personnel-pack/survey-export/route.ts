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

// --- Rate limit (in-memory, v1) -----------------------------------------
// Max MAX_EXPORTS_PER_HOUR ZIP exports per IP per rolling 1-hour window.
// v1: single-process in-memory Map — resets on cold start.
// Acceptable for a low-traffic admin endpoint on a single Vercel instance.
// Upgrade path: swap _rateMap for Redis INCR+EXPIRE or Vercel KV to handle
//   multi-region / multi-instance deployments without per-instance state.
const _rateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_EXPORTS_PER_HOUR = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: MAX_EXPORTS_PER_HOUR - 1 };
  }
  if (entry.count >= MAX_EXPORTS_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: MAX_EXPORTS_PER_HOUR - entry.count };
}


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

export async function GET(request: Request) {
  // --- Input validation ---------------------------------------------------
  // This endpoint accepts NO query parameters. Any params indicate a
  // malformed or probing request — reject before touching the DB.
  const _url = new URL(request.url);
  const _badParams = [..._url.searchParams.keys()];
  if (_badParams.length > 0) {
    const _ip0 = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    console.warn(`[survey-export] REJECTED unexpected params: ${_badParams.join(", ")} ip=${_ip0}`);
    return new Response("Bad Request: unexpected query parameters", { status: 400 });
  }

  // --- Rate limit ---------------------------------------------------------
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(clientIp);
  if (!allowed) {
    console.warn(`[survey-export] RATE LIMITED ip=${clientIp}`);
    return new Response("Too Many Requests: max 5 ZIP exports per hour", {
      status: 429,
      headers: { "Retry-After": "3600", "X-RateLimit-Limit": String(MAX_EXPORTS_PER_HOUR) },
    });
  }

  // Decode Basic Auth username for audit log.
  // Middleware has already verified credentials — this is best-effort labeling only.
  const _authRaw = request.headers.get("authorization") ?? "";
  const authUser = _authRaw.startsWith("Basic ")
    ? Buffer.from(_authRaw.slice(6), "base64").toString().split(":")[0]
    : "unknown";

  const generatedAt = new Date().toLocaleString("en-US", { timeZoneName: "short" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  const people = await fetchPeople();

  // --- Audit log ----------------------------------------------------------
  console.warn(
    `[survey-export] AUDIT ts=${new Date().toISOString()} user=${authUser} ip=${clientIp} records=${people.length} quota_remaining=${remaining}`
  );

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
