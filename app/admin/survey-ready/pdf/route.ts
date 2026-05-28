import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export async function GET() {
  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      competencies: { orderBy: { expiresAt: "asc" } },
      trainings: { orderBy: { completedAt: "desc" } },
      signOffs: { orderBy: { signedAt: "desc" } },
      authorizations: {
        include: {
          document: true,
        },
        orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const reviewEvents = await prisma.personnelPackReviewEvent.findMany({
    include: {
      competencyRecord: true,
    },
    orderBy: { reviewedAt: "desc" },
  });
  const documents = await prisma.personnelPackDocument.findMany({
    include: {
      versions: {
        orderBy: { effectiveDate: "desc" },
      },
    },
    orderBy: { code: "asc" },
  });
  const reviewCounts = new Map<string, number>();
  for (const event of reviewEvents) {
    reviewCounts.set(event.competencyRecord.personId, (reviewCounts.get(event.competencyRecord.personId) || 0) + 1);
  }

  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Header
  doc.font("Helvetica-Bold").fontSize(18).text("Personnel Pack — Survey-ready bundle", { align: "left" });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9).fillColor("#666")
    .text(`Generated ${new Date().toLocaleString("en-US")}`)
    .text("Workflow documentation support. Human-reviewed drafting. Confirm completeness before submission.");
  doc.moveDown(1);
  doc.fillColor("#000");

  doc.font("Helvetica-Bold").fontSize(11).text("ISO 15189 controlled documents");
  doc.font("Helvetica").fontSize(9).fillColor("#222");
  for (const documentRecord of documents) {
    const currentVersion = documentRecord.versions.find((version) => version.supersededDate === null);
    doc.text(`  • ${documentRecord.code} — ${documentRecord.title} (${documentRecord.kind})`);
    doc.text(`    Current version: ${currentVersion?.versionNumber || "missing"} · Effective ${fmt(currentVersion?.effectiveDate)}`);
  }
  doc.moveDown(0.8);

  // Group by role
  const byRole = new Map<string, typeof people>();
  for (const p of people) {
    if (!byRole.has(p.role)) byRole.set(p.role, [] as typeof people);
    byRole.get(p.role)!.push(p);
  }

  for (const [role, group] of byRole.entries()) {
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text(role);
    doc.moveTo(doc.x, doc.y).lineTo(540, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.5);

    for (const p of group) {
      if (doc.y > 680) doc.addPage();

      doc.font("Helvetica-Bold").fontSize(11).text(p.name);
      doc.font("Helvetica").fontSize(9).fillColor("#444")
        .text(`${p.cliaCertNumber ? p.cliaCertNumber + " · " : ""}Hired ${fmt(p.hireDate)}`);
      doc.moveDown(0.3);

      // Competencies
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text("Competencies");
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      if (p.competencies.length === 0) {
        doc.text("  —");
      } else {
        for (const c of p.competencies) {
          doc.text(`  • ${c.type} — ${c.status}${c.expiresAt ? ` (expires ${fmt(c.expiresAt)})` : ""}`);
        }
      }

      // Trainings
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text("Trainings");
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      if (p.trainings.length === 0) {
        doc.text("  —");
      } else {
        for (const t of p.trainings.slice(0, 6)) {
          doc.text(`  • ${t.course}${t.provider ? ` (${t.provider})` : ""} — ${fmt(t.completedAt)}`);
        }
      }

      // Sign-offs
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text("Director sign-offs");
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      if (p.signOffs.length === 0) {
        doc.text("  —");
      } else {
        for (const s of p.signOffs) {
          doc.text(`  • ${s.scope} — ${s.directorName} (${fmt(s.signedAt)})`);
        }
      }

      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text("ISO review events");
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      doc.text(`  • Logged review events: ${reviewCounts.get(p.id) || 0}`);

      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text("Procedure authorizations");
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      if (p.authorizations.length === 0) {
        doc.text("  —");
      } else {
        for (const authorization of p.authorizations) {
          const status = authorization.revokedAt ? `revoked ${fmt(authorization.revokedAt)}` : `active ${fmt(authorization.authorizedAt)}`;
          doc.text(`  • ${authorization.document.code} — ${authorization.document.title} (${status})`);
        }
      }

      doc.moveDown(0.7);
    }
    doc.moveDown(0.5);
  }

  doc.end();
  const buffer = await done;
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="personnel-pack-survey-ready-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
