const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const phone = (ui.match(/@media\(max-width:560px\)\{[\s\S]*?\n  \}/) || [''])[0];

test('the header adapts to phone widths', () => {
  assert.ok(phone, 'a max-width:560px media query must exist');
  assert.match(phone, /\.bar\{[^}]*flex-wrap:wrap/);
  assert.match(phone, /\.brand small\{display:none\}/);
});

test('nav button labels collapse to icons on phones', () => {
  for (const id of ['navchatlbl', 'navfavlbl', 'navbooklbl']) assert.ok(phone.includes('#' + id), id);
  assert.match(phone, /#navchatlbl[^}]*\{display:none\}/);
});

test('the viewport meta keeps the layout at device width', () => {
  assert.match(ui, /<meta name="viewport" content="width=device-width, initial-scale=1/);
});
