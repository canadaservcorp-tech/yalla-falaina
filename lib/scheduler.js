// Runs the recurring jobs inside the web process, so a single Railway service is
// enough. Set JOBS=off on any extra instance to keep only one runner.
const JOBS = [
  { name: 'jobs-refresh', everyMs: 24 * 60 * 60 * 1000, run: () => require('./jobsIngest').refresh() },
  { name: 'news-refresh', everyMs: 6 * 60 * 60 * 1000, run: () => require('./newsIngest').refresh() },
  { name: 'subscription-lapse', everyMs: 60 * 60 * 1000, run: () => require('../scripts/subscription-lapse').run() },
  { name: 'checkout-reminder', everyMs: 60 * 60 * 1000, run: () => require('../scripts/checkout-reminder').run() },
  { name: 'verify-reminder', everyMs: 6 * 60 * 60 * 1000, run: () => require('../scripts/verify-reminder').run() },
  { name: 'document-retention', everyMs: 24 * 60 * 60 * 1000, run: () => require('../scripts/document-retention').run() },
  { name: 'profile-retention', everyMs: 24 * 60 * 60 * 1000, run: () => require('../scripts/profile-retention').run() },
];

function start() {
  if (String(process.env.JOBS || '').toLowerCase() === 'off') return [];
  return JOBS.map(job => {
    // a job must never take the server down, so failures are logged and retried next tick
    const tick = () => Promise.resolve().then(job.run)
      .catch(e => console.error('job ' + job.name, e));
    const timer = setInterval(tick, job.everyMs);
    timer.unref();
    setTimeout(tick, 30 * 1000).unref(); // let the boot finish before the first run
    return timer;
  });
}

module.exports = { start, JOBS };
