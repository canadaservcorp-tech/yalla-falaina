'use strict';
// Renders lib/cvBuilder.js's normalized CV data model to a .docx Buffer via
// the `docx` library (pure JS, no native build step). Mirrors lib/cvPdf.js's
// section order/labels exactly so the two formats are the same CV, not two
// different documents that happen to share a name.
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { describeWorkEntry, describeEducationEntry, describeCertification, describeLanguage } = require('./cvBuilder');

const LABELS = {
  en: { experience: 'Work Experience', education: 'Education', certifications: 'Certifications', languages: 'Languages' },
  fr: { experience: 'Expérience professionnelle', education: 'Formation', certifications: 'Certifications', languages: 'Langues' },
};

const heading = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
const bold = (text) => new Paragraph({ children: [new TextRun({ text, bold: true })] });
const dim = (text) => new Paragraph({ children: [new TextRun({ text, italics: true, color: '555555' })] });
const plain = (text) => new Paragraph({ text });

async function renderCvDocx(data) {
  const t = LABELS[data.lang] || LABELS.en;
  const children = [];

  children.push(new Paragraph({ text: data.name || 'Curriculum Vitae', heading: HeadingLevel.TITLE }));
  if (data.headline) children.push(dim(data.headline));
  const contactLine = [data.email, data.phone, [data.city, data.country].filter(Boolean).join(', ')]
    .filter(Boolean).join('   |   ');
  if (contactLine) children.push(plain(contactLine));

  if (data.workHistory.length) {
    children.push(heading(t.experience));
    for (const w of data.workHistory) {
      const { title, subtitle, body } = describeWorkEntry(w);
      children.push(bold(title));
      if (subtitle) children.push(dim(subtitle));
      if (body) children.push(plain(body));
    }
  }
  if (data.education.length) {
    children.push(heading(t.education));
    for (const e of data.education) {
      const { title, subtitle } = describeEducationEntry(e);
      children.push(bold(title));
      if (subtitle) children.push(dim(subtitle));
    }
  }
  if (data.certifications.length) {
    children.push(heading(t.certifications));
    for (const c of data.certifications) children.push(plain('• ' + describeCertification(c)));
  }
  if (data.languages.length) {
    children.push(heading(t.languages));
    children.push(plain(data.languages.map(describeLanguage).join('   ·   ')));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { renderCvDocx };
