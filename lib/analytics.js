// Google Analytics 4, consent-gated. The measurement id lives in the environment, so the
// repository never carries a property id and a deployment without the variable ships no
// tracking at all: the page then exposes no TP_GA_ID and the banner never appears.
//
// Québec's Law 25 requires consent before non-essential tracking runs, so the server only
// publishes the id — the browser loads gtag.js after the visitor accepts (see public/index.html).
const ID = /^G-[A-Z0-9]{4,20}$/;

function measurementId() {
  const id = String(process.env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  return ID.test(id) ? id : '';
}

// Google serves the tag from googletagmanager and reports hits to google-analytics; both
// origins are added to the CSP only while analytics is configured.
const ORIGINS = {
  script: ['https://www.googletagmanager.com'],
  connect: ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://region1.google-analytics.com'],
  img: ['https://www.googletagmanager.com', 'https://www.google-analytics.com'],
};

function head() {
  const id = measurementId();
  return id ? `<script>window.TP_GA_ID=${JSON.stringify(id)};</script>` : '';
}

module.exports = { measurementId, head, ORIGINS };
