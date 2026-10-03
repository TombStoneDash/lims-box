import PDFDocument from 'pdfkit';

// Original blank worksheets, not a reproduction of a licensed standard. Bump the
// version and fixed metadata date whenever the template content/layout changes.
export const PDF_VERSION = 'v1';
export const PDF_LABEL = 'ISO 15189 Personnel Pack worksheets';
export const PDF_FILENAME = 'lims-box-personnel-pack-worksheets-v1.pdf';

const worksheets = [
  ['Personnel record', ['Name', 'Role and responsibilities', 'Qualifications and supporting evidence', 'Credentials and expiry dates', 'Reviewer and review date']],
  ['Training record', ['Personnel name', 'Topic / procedure and version', 'Training date and trainer', 'Method and supporting evidence', 'Outcome and follow-up', 'Trainee and trainer signatures']],
  ['Competency assessment', ['Personnel name', 'Procedure / task and version', 'Assessment method and evidence', 'Assessment date and assessor', 'Outcome and limitations', 'Corrective actions / reassessment date', 'Assessor signature']],
  ['Procedure authorization', ['Personnel name', 'Procedure and version', 'Scope and limitations', 'Supporting competency evidence', 'Effective date and review date', 'Authorizing person and signature']],
  ['Review checklist', ['Personnel records complete', 'Credentials reviewed', 'Training evidence reviewed', 'Competency evidence reviewed', 'Authorizations reviewed', 'Gaps, owner and due date', 'Reviewer signature and date']],
] as const;

export async function generatePersonnelPackPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER', margin: 54, autoFirstPage: false,
      info: {
        Title: PDF_LABEL, Author: 'LIMS BOX',
        CreationDate: new Date('2026-10-03T00:00:00Z'),
        ModDate: new Date('2026-10-03T00:00:00Z'),
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [index, [title, fields]] of worksheets.entries()) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(18).text(title);
      doc.moveDown(0.5).font('Helvetica').fontSize(10).text(`${PDF_LABEL} | ${PDF_VERSION}`);
      doc.moveDown().text('Blank documentation aid. Adapt to your laboratory procedures and review against your licensed standard. This worksheet does not certify compliance.');
      let y = 190;
      for (const field of fields) {
        doc.font('Helvetica-Bold').fontSize(10).text(field, 54, y);
        doc.moveTo(54, y + 40).lineTo(558, y + 40).strokeColor('#999999').stroke();
        y += 64;
      }
      doc.font('Helvetica').fontSize(9).fillColor('#555555')
        .text(`LIMS BOX | ${index + 1} / ${worksheets.length}`, 54, 720, { lineBreak: false });
      doc.fillColor('#000000');
    }
    doc.end();
  });
}
