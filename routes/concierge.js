// On-site AI concierge: greets a visitor, works out which service and city they need in
// FR/EN, and hands them to a search or a signup. The model is called server-side only, so
// the key never ships to the browser; without a key the endpoint stays dark (503).
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_TURNS = 12;                    // conversation length sent back to the model
const MAX_CHARS = 600;                   // per visitor message
const TIMEOUT_MS = 20000;                // never hold a request open on a stalled upstream

// Honesty rules mirror the product: TrouvePro connects, it does not verify, and it never
// discloses an exact address. The trailing JSON is how the model asks for a UI action.
const SYSTEM = `Tu es l'assistant d'accueil de TrouvePro, une plateforme québécoise qui met en relation les gens avec les prestataires de services les plus proches d'eux (Laval, Montréal, Rive-Nord). Réponds toujours dans la langue du visiteur (français ou anglais).

TON RÔLE
- Comprendre quel service la personne cherche et dans quelle ville ou quartier.
- Expliquer simplement le fonctionnement : la recherche par proximité et la messagerie sont gratuites pour les clients; les prestataires paient un abonnement.
- Proposer doucement une recherche ou la création d'un compte. Jamais insistant.

RÈGLES D'HONNÊTETÉ
- TrouvePro met en relation, il ne vérifie pas les qualifications : la vérification finale revient au client. N'offre aucune garantie.
- Ne donne jamais l'adresse exacte d'un prestataire : seulement une distance approximative.
- N'invente jamais de prestataire, de prix, de note ni de disponibilité. Si tu ne sais pas, dis-le.
- Ne demande jamais de numéro de carte, de NAS ni de mot de passe.
- Pour une urgence menaçant la vie ou la sécurité, dis d'appeler le 911.

FORME
- 2 à 4 phrases, concrètes.
- Quand tu proposes une action, termine par un bloc JSON seul sur la dernière ligne, par exemple {"action":"search","service":"plombier","city":"Laval"} ou {"action":"signup"} ou {"action":"none"}. N'écris jamais ce JSON dans une phrase.`;

const ACTIONS = ['search', 'signup', 'none'];

// The model is asked to end with a JSON action; strip it so the visitor never sees raw JSON.
function splitAction(text) {
  const m = text.match(/\{[^{}]*"action"[^{}]*\}\s*$/);
  if (!m) return { reply: text, action: { action: 'none' } };
  const reply = text.slice(0, m.index).trim();
  try {
    const parsed = JSON.parse(m[0]);
    const action = ACTIONS.includes(parsed.action) ? parsed.action : 'none';
    return {
      reply,
      action: {
        action,
        service: sec.clean(parsed.service, 60) || null,
        city: sec.clean(parsed.city, 60) || null,
      },
    };
  } catch (e) {
    return { reply, action: { action: 'none' } };            // malformed: drop it, keep the text
  }
}

router.post('/', sec.limits.concierge, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Concierge unavailable' });

  const msgs = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user')
    return res.status(400).json({ error: 'No message' });

  let data;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, messages: msgs }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      console.error('concierge upstream', r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ error: 'Concierge unavailable' });
    }
    data = await r.json();
  } catch (e) {
    console.error('concierge', e.name, e.message);
    return res.status(502).json({ error: 'Concierge unavailable' });
  }

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) return res.status(502).json({ error: 'Concierge unavailable' });
  const { reply, action } = splitAction(text);

  // Intent only — never the conversation, never anything identifying (Law 25: collect the
  // minimum). Analytics must not be able to fail a visitor's reply, so it is not awaited.
  supabase.from('concierge_events')
    .insert({ action: action.action, service: action.service, city: action.city })
    .then(({ error }) => { if (error) console.error('concierge event', error.message); },
      e => console.error('concierge event', e.message));

  res.json({ success: true, reply: reply || text, action });
});

module.exports = router;
