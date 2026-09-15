const test = require('node:test');
const assert = require('node:assert');
const { start, JOBS } = require('../lib/scheduler');

test('scheduler runs the feed refresh, lapse, retention and checkout-reminder jobs', () => {
  delete process.env.JOBS;
  const timers = start();
  assert.equal(timers.length, 6);
  timers.forEach(t => clearInterval(t));
  assert.deepEqual(JOBS.map(j => j.name),
    ['jobs-refresh', 'news-refresh', 'subscription-lapse', 'checkout-reminder', 'document-retention', 'profile-retention']);
});

test('JOBS=off disables the in-process runner', () => {
  process.env.JOBS = 'off';
  assert.deepEqual(start(), []);
  delete process.env.JOBS;
});
