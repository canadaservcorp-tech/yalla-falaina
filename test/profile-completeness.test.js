// lib/profileCompleteness.js — the Section 10 gate. Covers the student-track
// branch: a seeking_study profile satisfies the "target" requirement with
// target_degree_level / target_field_of_study instead of sector/role_type,
// which the student signup form never asks for.
const test = require('node:test');
const assert = require('node:assert');
const { computeCompleteness } = require('../lib/profileCompleteness');

const completeStudentProfile = {
  preferred_language: 'en',
  preferred_country: 'canada',
  seeking_study: true,
  target_degree_level: 'masters',
  target_field_of_study: 'computer science',
};
const completeSeeker = {
  work_history: [], education: [], certifications: [], languages: ['en'],
  has_passport: true, has_visa: false,
  has_legal_residency_current_country: true, has_family_or_host_abroad: false,
  confirmed_by_user: true,
};

test('a student profile passes the target requirement without sector/role_type', () => {
  const { isComplete, missing } = computeCompleteness({ profile: completeStudentProfile, seekerProfile: completeSeeker });
  assert.equal(isComplete, true);
  assert.deepEqual(missing, []);
});

test('a student with no study target gets a student-specific missing name', () => {
  const { isComplete, missing } = computeCompleteness({
    profile: { ...completeStudentProfile, target_degree_level: null, target_field_of_study: null },
    seekerProfile: completeSeeker,
  });
  assert.equal(isComplete, false);
  assert.ok(missing.includes('target_degree_level_or_field_of_study'));
  assert.ok(!missing.includes('sector_or_role_type'));
});

test('a treatment-seeker profile with a filed intake passes the target requirement', () => {
  const { isComplete, missing } = computeCompleteness({
    profile: { preferred_language: 'en', preferred_country: 'canada', seeking_treatment: true },
    seekerProfile: completeSeeker,
    hasMedicalIntake: true,
  });
  assert.equal(isComplete, true);
  assert.deepEqual(missing, []);
});

test('a treatment-seeker with no filed intake is asked for required_treatment, not a job sector', () => {
  const { isComplete, missing } = computeCompleteness({
    profile: { preferred_language: 'en', preferred_country: 'canada', seeking_treatment: true },
    seekerProfile: completeSeeker,
    hasMedicalIntake: false,
  });
  assert.equal(isComplete, false);
  assert.ok(missing.includes('required_treatment'));
  assert.ok(!missing.includes('sector_or_role_type'));
});

test('a job-seeker profile still requires sector_or_role_type', () => {
  const { isComplete, missing } = computeCompleteness({
    profile: { preferred_language: 'en', preferred_country: 'canada', seeking_study: false },
    seekerProfile: completeSeeker,
  });
  assert.equal(isComplete, false);
  assert.ok(missing.includes('sector_or_role_type'));
});
