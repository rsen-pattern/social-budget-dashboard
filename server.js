// server.js
//
// Zero-dependency self-hosting server for the Social Budget Dashboard.
// No npm install, no package.json, no build step — just Node's built-ins
// (requires Node 18+ for the global fetch used by the chat proxy).
//
//   BIFROST_API_KEY=sk-... node server.js
//   # → http://localhost:8080/
//
// It does two things:
//   1. Serves index.html (and sibling static files) from this directory.
//   2. Proxies POST /.netlify/functions/chat to Pattern's Bifrost gateway,
//      keeping the API key server-side — the SAME path the dashboard already
//      calls, so index.html needs no changes whether it runs here or on Netlify.
//
// If BIFROST_API_KEY is not set, the dashboard still works fully; the chat
// panel just falls back to prompting for a key in-memory (as it does anywhere
// without the proxy). See README.md → Self-hosting.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;                       // serve files from the repo root
const BIFROST_URL = 'https://bifrost.pattern.com/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const sendJSON = (res, status, obj) =>
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify(obj));

// --- Bifrost chat proxy (mirrors netlify/functions/chat.js) -----------------
async function handleChat(req, res){
  const apiKey = process.env.BIFROST_API_KEY || process.env.BIFROST_KEY;
  if (!apiKey){
    return sendJSON(res, 500, { error: 'BIFROST_API_KEY not set in the server environment. See README.md → Self-hosting.' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON in request body' }); }

    const { messages, model = DEFAULT_MODEL, max_tokens = DEFAULT_MAX_TOKENS } = payload;
    if (!Array.isArray(messages) || messages.length === 0)
      return sendJSON(res, 400, { error: 'messages array required' });
    if (max_tokens > 4000)
      return sendJSON(res, 400, { error: 'max_tokens capped at 4000' });

    try {
      const upstream = await fetch(BIFROST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, max_tokens }),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { ...CORS, 'Content-Type': 'application/json' }).end(text);
    } catch (err) {
      sendJSON(res, 502, { error: 'Upstream Bifrost call failed: ' + (err.message || String(err)) });
    }
  });
}

// --- Static file serving (path-traversal safe) ------------------------------
function serveStatic(req, res){
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return sendJSON(res, 405, { error: 'Method not allowed' });

  const urlPath = decodeURIComponent((req.url.split('?')[0]) || '/');
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT, rel);

  // Never serve outside ROOT, and never serve the server/secrets themselves.
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html'))
    return sendJSON(res, 403, { error: 'Forbidden' });
  if (/(^|[\\/])(\.env|server\.js)$/.test(rel))
    return sendJSON(res, 404, { error: 'Not found' });

  fs.readFile(filePath, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'Not found' });
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(req.method === 'HEAD' ? undefined : data);
  });
}

http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/.netlify/functions/chat'){
    if (req.method === 'OPTIONS') return res.writeHead(200, CORS).end();
    if (req.method === 'POST') return handleChat(req, res);
    return sendJSON(res, 405, { error: 'Method not allowed' });
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Social Budget Dashboard → http://localhost:${PORT}/`);
  if (!(process.env.BIFROST_API_KEY || process.env.BIFROST_KEY))
    console.log('Note: BIFROST_API_KEY not set — chat will prompt for a key in-browser.');
});
