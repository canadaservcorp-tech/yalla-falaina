'use strict';
// Renders lib/cvBuilder.js's normalized CV data model to a PDF Buffer via
// pdfkit (pure JS, no native build step — safe on Railway). One clean,
// single-column layout; not meant to be a template system.
const PDFDocument = require('pdfkit');
const { describeWorkEntry, describeEducationEntry, describeCertification, describeLanguage } = require('./cvBuilder');

const LABELS = {
  en: { experience: 'Work Experience', education: 'Education', certifications: 'Certifications', languages: 'Languages', present: 'Present' },
  fr: { experience: 'Expérience professionnelle', education: 'Formation', certifications: 'Certifications', languages: 'Langues', present: 'Présent' },
};

function renderCvPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const t = LABELS[data.lang] || LABELS.en;

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(data.name || 'Curriculum Vitae');
    if (data.headline) doc.font('Helvetica').fontSize(12).fillColor('#444').text(data.headline);
    const contactLine = [data.email, data.phone, [data.city, data.country].filter(Boolean).join(', ')]
      .filter(Boolean).join('   |   ');
    if (contactLine) { doc.moveDown(0.2); doc.fontSize(10).fillColor('#666').text(contactLine); }
    doc.fillColor('#000');

    const section = (title) => {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111').text(title, { underline: true });
      doc.moveDown(0.25);
    };

    if (data.workHistory.length) {
      section(t.experience);
      for (const w of data.workHistory) {
        const { title, subtitle, body } = describeWorkEntry(w);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(title);
        if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555').text(subtitle);
        if (body) { doc.font('Helvetica').fontSize(10).fillColor('#222').text(body); }
        doc.moveDown(0.4);
      }
    }
    if (data.education.length) {
      section(t.education);
      for (const e of data.education) {
        const { title, subtitle } = describeEducationEntry(e);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(title);
        if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555').text(subtitle);
        doc.moveDown(0.3);
      }
    }
    if (data.certifications.length) {
      section(t.certifications);
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      for (const c of data.certifications) doc.text('• ' + describeCertification(c));
    }
    if (data.languages.length) {
      section(t.languages);
      doc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(data.languages.map(describeLanguage).join('   ·   '));
    }

    doc.end();
  });
}

module.exports = { renderCvPdf };
