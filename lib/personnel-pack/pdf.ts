import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { DOCUMENT_BOUNDARY, TEMPLATE_REVISION, WORKSHEETS } from './template';

// Bump renderer revision for layout/font changes. Content edits change the key automatically.
export const PDF_SOURCE_SHA256 = createHash('sha256')
  .update(JSON.stringify({ renderer: 1, version: TEMPLATE_REVISION, boundary: DOCUMENT_BOUNDARY, worksheets: WORKSHEETS }))
  .digest('hex');
export const GENERATED_PACK_KEY = `iso15189-generated-${PDF_SOURCE_SHA256}`;
export const GENERATED_PACK_FILENAME = 'lims-box-iso-15189-personnel-pack-v1-5-worksheets.pdf';
export const GENERATED_PACK_LABEL = 'ISO 15189 Personnel Pack v1.5 worksheets';

/** Only fixed blank worksheet content can enter this generator; no user/database inputs. */
export async function generatePersonnelPackPdf(): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4', margin: 44, autoFirstPage: false,
    info: {
      Title: GENERATED_PACK_LABEL, Author: 'LIMS BOX / Tombstone Dash LLC',
      Subject: 'Blank personnel documentation worksheets; human review required',
      CreationDate: new Date('2026-08-27T00:00:00Z'),
      ModDate: new Date('2026-08-27T00:00:00Z'),
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  const left = 44;
  const width = 507;
  const bottom = 762;
  let page = 0;
  let title = 'ISO 15189 Personnel Pack';
  function newPage(continuation = false) {
    doc.addPage();
    page++;
    doc.font('Helvetica').fontSize(8).fillColor('#555555')
      .text('LIMS BOX | ISO 15189 PERSONNEL PACK v1.5', left, 30, { lineBreak: false });
    doc.text(`Documentation aid - human review required | ${page}`, left, 801, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#183d2a')
      .text(title + (continuation ? ' (continued)' : ''), left, 57, { width });
    doc.moveDown(0.6);
  }
  function space(height: number) {
    if (doc.y + height > bottom) newPage(true);
  }
  function paragraph(value: string, check = false) {
    doc.font('Helvetica').fontSize(10);
    const text = check ? `[ ] ${value}` : value;
    const height = doc.heightOfString(text, { width }) + 10;
    space(height);
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(text, left, doc.y, { width });
    doc.moveDown(0.7);
  }
  newPage();
  paragraph('Customer edition: printable personnel documentation worksheets for medical laboratories using ISO 15189:2022.');
  paragraph('Version 1.5 | Blank worksheets | Source edition: 27 August 2026');
  for (const worksheet of WORKSHEETS) paragraph(worksheet.title);
  paragraph(DOCUMENT_BOUNDARY);

  for (const worksheet of WORKSHEETS) {
    title = worksheet.title;
    newPage();
    paragraph(worksheet.description);
    for (const field of worksheet.fields ?? []) {
      space(32);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor('#222222').text(field, left + 5, y + 5, { width: 171 });
      doc.strokeColor('#aaaaaa').lineWidth(0.5).rect(left, y, width, 30).stroke();
      doc.moveTo(left + 183, y).lineTo(left + 183, y + 30).stroke();
      doc.y = y + 30;
    }
    if (worksheet.fields?.length) doc.y += 12;
    if (worksheet.columns) {
      const columns = worksheet.columns;
      const firstWidth = worksheet.rows ? width * 0.44 : width / columns.length;
      const widths = columns.map((_, index) => index === 0 ? firstWidth : (width - firstWidth) / (columns.length - 1));
      function tableRow(cells: string[], header: boolean) {
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        const height = Math.max(32, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - 10 }) + 12));
        if (doc.y + height > bottom) {
          newPage(true);
          if (!header) tableRow(columns, true);
        }
        const y = doc.y;
        let x = left;
        for (let i = 0; i < columns.length; i++) {
          doc.strokeColor('#aaaaaa').rect(x, y, widths[i], height).stroke();
          doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#222222')
            .text(cells[i] ?? '', x + 5, y + 6, { width: widths[i] - 10 });
          x += widths[i];
        }
        doc.y = y + height;
      }
      tableRow(columns, true);
      for (const row of worksheet.rows ?? Array<string>(6).fill('')) tableRow([row], false);
      doc.y += 12;
    }
    for (const check of worksheet.checks ?? []) paragraph(check, true);
    for (const note of worksheet.notes ?? []) paragraph(note);
  }
  doc.end();
  return done;
}
