# Social Budget Dashboard

A live, Pattern-branded dashboard for the Social Budget Google Sheet.
Pulls every campaign-day row directly from the published sheet, renders it as
an interactive single-page app, and (optionally) lets you chat with the data
through Pattern's Bifrost LLM gateway.

**Live:** [social-budget-tracker.netlify.app](https://social-budget-tracker.netlify.app/)

---

## What's in the repo

```
.
├── index.html                    # The whole dashboard — single file, no build
├── netlify.toml                  # Netlify config (publish dir + function dir)
├── netlify/
│   └── functions/
│       └── chat.js               # Bifrost proxy (keeps API key server-side)
├── .env.example                  # Env var template
├── .gitignore
└── README.md
```

That's it. No `package.json`, no build step, no framework. Chart.js is loaded
from a CDN. Pattern fonts come from Google Fonts.

---

## How it works

### Data flow

1. On page load (and on every Refresh click), `index.html` does two parallel
   `fetch()` calls to the published Google Sheet's CSV endpoint:
   - `Facebook Revenue Sheet` (gid 131056311) — every campaign-day row
   - `Client Overview` (gid 220651307) — account-day rollup *and* the
     `Account → Client` mapping (last three columns)
2. The CSV is parsed in-browser (no server), enriched with derived `region` and
   `objective` from naming conventions, and aggregated into the KPI strip,
   charts, insight cards, tables, and recommendations.
3. The whole dashboard re-renders client-side as the user filters or changes
   the time range. URL hash holds the filter state so views are shareable.

### Chat with the data (Bifrost)

The "Ask the data" button opens a side panel that POSTs the user's question
plus a JSON snapshot of the current filtered view to the LLM. The model
is `anthropic/claude-sonnet-4-6` by default (per Pattern's Bifrost model
catalog), and the system prompt tells it to quote actual numbers and not
invent figures.

The frontend tries the Netlify function at `/.netlify/functions/chat` first.
If the function returns 404 (i.e. you're running `index.html` directly or
haven't set the env var), it falls back to prompting for an API key in-memory
for that session.

The Netlify function:
- Reads `BIFROST_API_KEY` from environment variables
- Forwards the request to `https://bifrost.pattern.com/v1/chat/completions`
- Returns the response with permissive CORS headers

---

## Local development

```bash
# Clone and serve
git clone <this-repo>
cd social-budget-dashboard
python3 -m http.server 8000
# Open http://localhost:8000/
```

The dashboard works fully without the Netlify function — fetch goes straight
to the published Google Sheet. The chat panel will prompt for a Bifrost key
when first opened.

To test the Netlify function locally, install the Netlify CLI:

```bash
npm install -g netlify-cli
cp .env.example .env
# Edit .env with your Bifrost key
netlify dev
# → http://localhost:8888/ with the function live at /.netlify/functions/chat
```

---

## Deploying to Netlify

### One-time setup

1. Push this repo to GitHub.
2. In [Netlify](https://app.netlify.com/), **Add new site → Import from Git → GitHub**, pick the repo. No build command, no publish dir override — `netlify.toml` handles it.
3. **Site settings → Environment variables → Add a single variable:**
   - Key: `BIFROST_API_KEY`
   - Value: *your Bifrost key*
4. Trigger a deploy. The function at `/.netlify/functions/chat` is now live.

### Future pushes

Push to `main`. Netlify rebuilds automatically. The published sheet is read
live every page load, so adding rows in the sheet shows up after the next
refresh — no deploy needed.

---

## Configuration

### Change the data source

The sheet ID is set in two places in `index.html`. Search for
`PUB_BASE` and update the two `GID_*` constants:

```js
const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/<pub-id>/pub';
const GID_FB = 131056311;      // Facebook Revenue Sheet
const GID_CLIENT = 220651307;  // Client Overview
```

To find the GIDs of other tabs, open the published HTML view of the sheet
and look at the tab URLs.

### Change the model

In `index.html`, change `CHAT_MODEL` to any ID supported by Pattern's Bifrost
catalog — `anthropic/claude-haiku-4-5` for cheaper/faster, `openai/gpt-4.1`
to swap providers.

```js
const CHAT_MODEL = 'anthropic/claude-sonnet-4-6';
```

### Change the system prompt

The system prompt for the chat lives in `buildSystemPrompt()` in
`index.html`. Edit there.

---

## Sheet schema assumptions

The dashboard expects these two tabs to exist with these columns:

**Facebook Revenue Sheet** (gid 131056311):

| Date | Year & month | Account name | Campaign name | Cost | Website purchases conversion value |
|------|---|---|---|---|---|

**Client Overview** (gid 220651307):

| Date | Meta Ads Account | GA4 Property Name | Client Name | Region | Spends | Meta Ads Revenue | Facebook ROAS | LC Revenue (GA4) | LC ROAS | | | Facebook Ad Account (N) | GA4 Property Name (O) | Client Name (P) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

The trailing 3 columns (N, O, P) are the lookup table the dashboard uses to
turn Facebook ad account names into display client names.

If you rename either tab or change column order, the parser needs updating —
see `loadData()` in `index.html`.

---

## Known limitations

- **Spend duplication**: `Sting Sports Main Ad Account` is mapped to multiple
  clients in the sheet (Sting AU, Sting US, Sting UK, Sting DE) all pointing
  at the same FB ad account. Last-write-wins, so the dashboard currently shows
  it as "Sting DE". If that matters, the mapping needs to use account + region
  as the key.
- **Region detection** uses regex on the account/campaign name. Most patterns
  in the current sheet are covered (`| NZ |`, `-NZ-`, `USA`, etc.), but
  unusual naming will fall into `AU` by default.
- **Objective detection** uses keyword matching. Campaigns whose name doesn't
  contain `Retargeting`, `Prospecting`, `Awareness`, `Traffic`, `DPA`,
  `Advantage`, `Conversion`, `Video` etc. land in `Other`.
- **No GA4 metrics** in the chart yet — only Meta-attributed revenue. GA4
  last-click numbers exist in the Client Overview sheet and could be added.
- **Browser-only**. There's no backend storing anything. State persists only
  in the URL hash.

---

## Roadmap ideas

- GA4 last-click ROAS alongside Meta ROAS (conservative attribution)
- Click a client bar to filter to it
- Comparison mode (current period vs same-length prior period)
- Auto-refresh every N minutes (toggle)
- Streaming chat responses
- "Send to Slack" / "Send to email" buttons (Slack MCP is already connected
  in the Pattern environment)
- PDF / PPTX export of the current view

---

## Source data

Published Google Sheet (read-only):
[New Social Budget Sheet 2026](https://docs.google.com/spreadsheets/d/e/2PACX-1vT-eN2NO8xpsyuBEKnx_e4Qi8CfgzcFvclr0C5Cfe1_Lpl0Odpadd7d56UtbZRoGVIrUkY7Ccjh2Yof/pubhtml)

---

## License

Internal Pattern tooling.
