'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const { retrieveJobs } = require('./lib/matching');
const { buildSystemPrompt } = require('./lib/systemPrompt');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(anthropic),
    model: MODEL,
    note: 'Prototype demo — no payments, no auth, no persistence. See README.md.'
  });
});

// Lets the frontend show the retrieved job list separately from the chat
// reply, which is also a useful way to demonstrate the "code decides the
// candidate set" pattern independent of whether the LLM call succeeds.
app.post('/api/jobs/search', (req, res) => {
  const { query = '', preferredCountry } = req.body || {};
  const jobs = retrieveJobs({ query, preferredCountry, limit: 5 });
  res.json({ jobs });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], dialectHint, preferredCountry } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!Array.isArray(history) || history.length > 40) {
      return res.status(400).json({ error: 'history must be an array of at most 40 messages' });
    }

    const jobs = retrieveJobs({ query: message, preferredCountry, limit: 5 });
    const systemPrompt = buildSystemPrompt({ jobs, dialectHint });

    if (!anthropic) {
      return res.json({
        reply:
          "[Demo mode — no ANTHROPIC_API_KEY configured] I can't reach the AI model right now, but here's what the matching engine found for you based on your message:\n\n" +
          jobs.map((j) => `• ${j.title} — ${j.city}, ${j.country} (${j.sourceType === 'informal_unverified' ? 'unverified listing — verify independently' : 'licensed feed'})`).join('\n') +
          '\n\nSet ANTHROPIC_API_KEY in your .env file to enable the real conversational concierge — see README.md.',
        jobs,
        llmConfigured: false
      });
    }

    const anthropicMessages = [
      ...history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20),
      { role: 'user', content: message }
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    res.json({ reply, jobs, llmConfigured: true });
  } catch (err) {
    console.error('POST /api/chat failed:', err);
    res.status(500).json({
      error: 'Something went wrong generating a reply. This is a prototype — check server logs.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Yalla Falaina concierge prototype listening on http://localhost:${PORT}`);
  console.log(`LLM configured: ${Boolean(anthropic)} (model: ${MODEL})`);
});
