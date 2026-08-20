const { test } = require('node:test');
const assert = require('node:assert');
const { resolve } = require('../lib/activities');

// The real catalogue rows this feature has to line up with (subset, ids as seeded).
const CATALOG = [
  { id: 38, name_fr: 'Jardinage', name_en: 'Gardening' },
  { id: 36, name_fr: 'Aménagement paysager', name_en: 'Landscaping' },
  { id: 37, name_fr: 'Entretien de pelouse', name_en: 'Lawn care' },
  { id: 40, name_fr: "Émondage et abattage d'arbres", name_en: 'Tree trimming & removal' },
  { id: 39, name_fr: 'Déneigement', name_en: 'Snow removal' },
  { id: 18, name_fr: 'Plomberie', name_en: 'Plumbing' },
  { id: 17, name_fr: 'Électricien', name_en: 'Electrician' },
  { id: 30, name_fr: 'Ménage résidentiel', name_en: 'Residential cleaning' },
  { id: 90, name_fr: 'Fleuriste', name_en: 'Florist' },
  { id: 44, name_fr: 'Mécanicien (garagiste)', name_en: 'Mechanic' },
];

const names = ids => ids.map(id => CATALOG.find(p => p.id === id).name_en).sort();
const GARDEN = ['Gardening', 'Landscaping', 'Lawn care', 'Tree trimming & removal'];

test('every yard word reaches the same trades, in French and in English', () => {
  for (const word of ['gardener', 'gardening', 'jardinier', 'jardinage', 'landscape', 'landscaping',
    'paysagiste', 'trimming', 'élagage', 'émondage', 'pelouse', 'lawn', 'tonte', 'haie', 'tree']) {
    assert.deepEqual(names(resolve(word, CATALOG)), GARDEN.slice().sort(), word);
  }
});

test('a whole sentence in either language still resolves', () => {
  assert.deepEqual(names(resolve('I need a gardener for hedge trimming', CATALOG)), GARDEN.slice().sort());
  assert.deepEqual(names(resolve("besoin d'un jardinier à Laval", CATALOG)), GARDEN.slice().sort());
});

test('a trade stays inside its own group', () => {
  assert.deepEqual(names(resolve('plombier', CATALOG)), ['Plumbing']);
  assert.deepEqual(names(resolve('plumber', CATALOG)), ['Plumbing']);
  assert.deepEqual(names(resolve('deneigement', CATALOG)), ['Snow removal']);
  assert.deepEqual(names(resolve('snow', CATALOG)), ['Snow removal']);
  assert.deepEqual(names(resolve('electrician', CATALOG)), ['Electrician']);
  assert.deepEqual(names(resolve('fleuriste', CATALOG)), ['Florist']);
});

test('a catalogue name typed as-is resolves even without a synonym group', () => {
  assert.deepEqual(names(resolve('Ménage résidentiel', CATALOG)), ['Residential cleaning']);
  assert.deepEqual(names(resolve('Mechanic', CATALOG)), ['Mechanic']);
});

test('nothing is invented for an unknown or empty term', () => {
  for (const word of ['', '   ', 'zzzz', 'astronaute', '!!!']) {
    assert.deepEqual(resolve(word, CATALOG), [], JSON.stringify(word));
  }
});

test('short words never prefix-match a whole group', () => {
  assert.deepEqual(resolve('a', CATALOG), []);
  assert.deepEqual(resolve('je', CATALOG), []);
});

test('a missing or malformed catalogue resolves to nothing rather than throwing', () => {
  assert.deepEqual(resolve('gardener', null), []);
  assert.deepEqual(resolve('gardener', []), []);
  assert.deepEqual(resolve('gardener', [{ id: 'x' }]), []);
});
