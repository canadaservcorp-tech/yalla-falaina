'use strict';

// IndexNow — instant URL submission to the Bing index (also picked up by
// Yandex/Naver/Seznam). Bing's index is what ChatGPT/Copilot and several
// other answer engines search, so this is the free fast lane into AI answers.
// The key is PUBLIC on purpose — the key file /<key>.txt must be fetchable
// by the engines to prove we own the host; it authorizes nothing else.
const INDEXNOW_KEY = 'bbdddbb4-3b02-43e5-97e7-8068b52b7595';

const seo = require('./seo');

// POST the current sitemap URL set to the IndexNow endpoint. Engine-side
// verification is the key file this server serves at /<key>.txt.
async function submit({ publicUrl } = {}) {
  const host = (publicUrl || seo.base()).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const urlList = seo.INDEXABLE.map(p => `https://${host}${p}`);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, submitted: urlList.length, body: text.slice(0, 300) };
}

module.exports = { INDEXNOW_KEY, submit };
