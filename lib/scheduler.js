// Runs the recurring jobs inside the web process, so a single Railway service is
// enough. Set JOBS=off on any extra instance to keep only one runner.
const JOBS = [
  { name: 'booking-holds', everyMs: 60 * 60 * 1000, run: () => require('../scripts/booking-holds').run() },
  { name: 'notify-expiries', everyMs: 24 * 60 * 60 * 1000, run: () => require('../scripts/notify-expiries').run() },
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
