// netlify/functions/chat.js
//
// Serverless proxy for Pattern's Bifrost LLM gateway.
// Keeps BIFROST_API_KEY server-side so the dashboard frontend can
// chat with the data without exposing the key in the browser.
//
// Set in Netlify dashboard: Site settings → Environment variables → BIFROST_API_KEY
//
// Bifrost spec: OpenAI-compatible /v1/chat/completions endpoint.
// Default model: anthropic/claude-sonnet-4-6
// See: /mnt/skills/user/bifrost-integration/SKILL.md
//

const BIFROST_URL = 'https://bifrost.pattern.com/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Read API key from env. Accept both BIFROST_API_KEY and BIFROST_KEY
  // per the Bifrost integration skill's credential loading convention.
  const apiKey = process.env.BIFROST_API_KEY || process.env.BIFROST_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'BIFROST_API_KEY not set in Netlify environment variables. See README.md for setup.',
      }),
    };
  }

  // Parse request body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  const { messages, model = DEFAULT_MODEL, max_tokens = DEFAULT_MAX_TOKENS } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'messages array required' }),
    };
  }

  // Light guard against runaway token counts
  if (max_tokens > 4000) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'max_tokens capped at 4000' }),
    };
  }

  try {
    const upstream = await fetch(BIFROST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens }),
    });

    const text = await upstream.text();

    return {
      statusCode: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Upstream Bifrost call failed: ' + (err.message || String(err)),
      }),
    };
  }
};
