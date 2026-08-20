const test = require('node:test');
const assert = require('node:assert');
const { start, JOBS } = require('../lib/scheduler');

test('scheduler schedules the booking-hold and expiry jobs', () => {
  delete process.env.JOBS;
  const timers = start();
  assert.equal(timers.length, 2);
  timers.forEach(t => clearInterval(t));
  assert.deepEqual(JOBS.map(j => j.name), ['booking-holds', 'notify-expiries']);
  assert.equal(JOBS[0].everyMs, 3600000);
});

test('JOBS=off disables the in-process runner', () => {
  process.env.JOBS = 'off';
  assert.deepEqual(start(), []);
  delete process.env.JOBS;
});
