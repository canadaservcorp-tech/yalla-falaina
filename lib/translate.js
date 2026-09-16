'use strict';

// On-demand document/text translation -- thin wrapper around a real
// translation API, same house pattern as lib/webPush.js. Candidates: DeepL
// (best quality for European-language pairs) or Google Cloud Translate
// (broader Arabic-dialect and language coverage) -- vendor choice needs
// Hicham's sign-off (cost per character, which target languages seekers
// actually ask for) before Devin wires a real key. Distinct from
// public/i18n.js, which is the platform's OWN fixed five-language UI text
// (Arabic/French/English/Hindi/Turkish) and needs no external API at all -- this
// module is for translating a SEEKER'S document (CV, diploma, contract) into
// whatever language they ask for, unbounded, on demand.

const PROVIDER = process.env.TRANSLATE_API_PROVIDER || ''; // e.g. 'deepl' | 'google' -- unset until a vendor is chosen
const API_KEY = process.env.TRANSLATE_API_KEY || '';

const configured = () => Boolean(PROVIDER && API_KEY);

// text: the source text (a CV field, a short document excerpt -- NOT a whole
// PDF; document-level translation is a follow-on scope, not this call).
// targetLang: a BCP-47-ish language tag or plain language name, whatever the
// seeker asked for.
// Returns { translated: string|null, illustrative: boolean, note }.
async function translate({ text, targetLang } = {}) {
  if (!configured()) {
    return {
      translated: null,
      illustrative: true,
      note: 'Document translation is not yet configured on this platform.',
    };
  }
  // Real-provider call goes here once PROVIDER/API_KEY are set. Left
  // unimplemented on purpose -- see this module's header comment.
  throw new Error(`translate: TRANSLATE_API_PROVIDER=${PROVIDER} has no implementation wired in yet`);
}

module.exports = { configured, translate };
