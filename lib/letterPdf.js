'use strict';
// Renders a drafted letter (motivation/cover letter, university letter of
// interest) to a one-page PDF via pdfkit — same pure-JS discipline as
// lib/cvPdf.js. Layout: sender block top-left, date, subject, body
// paragraphs, closing. English/French only for the same reason as the CV:
// pdfkit ships no Arabic-capable font and no RTL shaping (see
// lib/cvBuilder.js's language note).
const PDFDocument = require('pdfkit');

function renderLetterPdf({ name, email, phone, city, country, subject, body, lang }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111').text(name || '');
    const contactLine = [email, phone, [city, country].filter(Boolean).join(', ')].filter(Boolean).join('   |   ');
    if (contactLine) doc.font('Helvetica').fontSize(9).fillColor('#555').text(contactLine);

    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10).fillColor('#333')
      .text(new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

    if (subject) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(subject);
    }

    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10.5).fillColor('#111');
    for (const para of String(body || '').split(/\n\s*\n/)) {
      const text = para.trim();
      if (!text) continue;
      doc.text(text, { align: 'left', lineGap: 2 });
      doc.moveDown(0.6);
    }

    doc.end();
  });
}

module.exports = { renderLetterPdf };
