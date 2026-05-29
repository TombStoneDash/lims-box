import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, REVIEW_TYPE_LABELS, REVIEW_OUTCOME_LABELS, type ReviewType, type ReviewOutcome } from "@/lib/personnel-pack-utils";

import PDFDocument from "pdfkit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** GET /api/competencies/:id/reviews/export — download competency record as PDF */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const competency = await prisma.competency.findUnique({
    where: { id },
    include: {
      person: true,
      reviewEvents: { orderBy: { reviewedAt: "asc" } },
    },
  });
  if (!competency) return apiError("NOT_FOUND", "Competency record not found", { competency_id: id }, 404);

  const { person, reviewEvents } = competency;

  // Fetch active authorization if any
  const activeAuth = await prisma.authorization.findFirst({
    where: { personId: person.id, isActive: true },
    include: { procedure: true },
  });

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 512; // usable width (612 - 2*50)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold").text("Personnel Competency Record", { align: "center" });
    doc.fontSize(9).font("Helvetica").text(`Generated: ${new Date().toISOString()}`, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Personnel ────────────────────────────────────────────────────────────
    doc.fontSize(10).font("Helvetica-Bold").text("PERSONNEL");
    doc.fontSize(9).font("Helvetica");
    doc.text(`Name: ${person.name}  |  Role: ${person.role}  |  ID: ${person.id}`);
    doc.text(`Competency: ${competency.type}  |  Status: ${competency.status}`);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Review History ───────────────────────────────────────────────────────
    doc.fontSize(10).font("Helvetica-Bold").text("COMPETENCY ASSESSMENT HISTORY");
    doc.moveDown(0.3);

    if (reviewEvents.length === 0) {
      doc.fontSize(9).font("Helvetica").text("No review events on record.");
    } else {
      // Column layout: Date | Type | Outcome | Reviewer | Next Due
      const cols = [
        { label: "Date",     x: 50,  w: 70 },
        { label: "Type",     x: 122, w: 90 },
        { label: "Outcome",  x: 214, w: 110 },
        { label: "Reviewer", x: 326, w: 130 },
        { label: "Next Due", x: 458, w: 104 },
      ];

      // Header row
      let hY = doc.y;
      doc.fontSize(8).font("Helvetica-Bold");
      cols.forEach((c) => doc.text(c.label, c.x, hY, { width: c.w, lineBreak: false }));
      doc.y = hY + 13;
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#cccccc").stroke().strokeColor("black");
      doc.moveDown(0.2);

      // Data rows
      doc.font("Helvetica");
      reviewEvents.forEach((ev) => {
        const rowY = doc.y;
        const cells = [
          fmt(ev.reviewedAt),
          REVIEW_TYPE_LABELS[ev.reviewType as ReviewType] ?? ev.reviewType,
          REVIEW_OUTCOME_LABELS[ev.reviewOutcome as ReviewOutcome] ?? ev.reviewOutcome,
          ev.reviewerName,
          fmt(ev.nextReviewDue),
        ];
        cells.forEach((text, i) => doc.text(text, cols[i].x, rowY, { width: cols[i].w, lineBreak: false }));
        doc.y = rowY + 13;
      });
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Corrective Actions ───────────────────────────────────────────────────
    const corrective = reviewEvents.filter((e) =>
      ["requires_remediation", "restricted"].includes(e.reviewOutcome)
    );
    doc.fontSize(10).font("Helvetica-Bold").text("CORRECTIVE ACTIONS");
    doc.moveDown(0.3);
    if (corrective.length === 0) {
      doc.fontSize(9).font("Helvetica").text("None.");
    } else {
      corrective.forEach((e) => {
        doc.fontSize(9).font("Helvetica-Bold").text(`${fmt(e.reviewedAt)} — ${e.reviewOutcome}`, { continued: false });
        doc.font("Helvetica").text(e.notes ?? "No notes recorded.");
        doc.moveDown(0.3);
      });
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Authorization Status ─────────────────────────────────────────────────
    doc.fontSize(10).font("Helvetica-Bold").text("AUTHORIZATION STATUS");
    doc.moveDown(0.3);
    if (activeAuth) {
      doc.fontSize(9).font("Helvetica");
      doc.text(`Procedure: ${activeAuth.procedure.name}  |  Authorized: ${fmt(activeAuth.authorizedAt)}`);
      doc.text(`Authorized by: ${activeAuth.authorizedBy}${activeAuth.scope ? "  |  Scope: " + activeAuth.scope : ""}`);
    } else {
      doc.fontSize(9).font("Helvetica").text("No active authorization on record.");
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);
    doc
      .fontSize(7)
      .fillColor("#888888")
      .text("Generated by LIMS BOX Personnel Pack v1.5  —  ISO 15189 clause 6.2", {
        align: "center",
        width: W,
      });

    doc.end();
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="competency-record-${id}.pdf"`,
    },
  });
}
