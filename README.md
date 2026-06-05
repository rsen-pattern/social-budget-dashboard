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

1. On page load (and on every Refresh click), `index.html` does parallel
   `fetch()` calls to the published Google Sheet's CSV endpoint:
   - `Facebook Revenue Sheet` (gid 131056311) — every campaign-day row *(required)*
   - `Client Overview` (gid 220651307) — account-day rollup *and* the legacy
     `Account → Client` mapping (last three columns) *(required)*
   - Optionally, the three new tabs (Client Mapping, Campaign Feed GA4, Budget
     Tracker) when their GID constants are set — each best-effort, so a failure
     just no-ops that feature (see Configuration)
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

// New tabs — IMPORTRANGE mirror tabs in the same master sheet (same PUB_BASE).
// Leave any of these null/'' to no-op the corresponding feature cleanly.
const GID_MAPPING  = null;     // "Client Mapping (Import)"    — deterministic account→client lookup
const GID_BUDGET   = null;     // "Budget Tracker (Import)"    — current-month budgets (pacing)
const GID_FEED_GA4 = null;     // "Campaign Feed GA4 (Import)" — campaign-day feed WITH GA4 columns
```

To find the GIDs of other tabs, open the published HTML view of the sheet
and look at the tab URLs.

### New data tabs (mapping, GA4 feed, budget pacing)

Three optional features read additional tabs of the **same** master sheet.
They are `IMPORTRANGE` mirror tabs (auto-synced from the separate "Paid Social
Monthly Budgets" workbook), each **Published to web → CSV**. Paste each tab's
published GID into the constant above:

| Constant | Tab | Powers | Behaviour when blank/404 |
|---|---|---|---|
| `GID_MAPPING` | Client Mapping (Import) | Deterministic `account → client` lookup | Falls back to the legacy Client Overview map (Sting collapse returns) |
| `GID_BUDGET` | Budget Tracker (Import) | Budget-pacing section (this month) | Pacing section is hidden |
| `GID_FEED_GA4` | Campaign Feed GA4 (Import) | GA4 last-click ROAS columns/KPIs; becomes the primary campaign-day feed | Stays on `GID_FB`, Meta-only |

Every new feature **degrades gracefully**: if its tab is missing, returns 404,
is empty, or comes back as an IMPORTRANGE transient (`Loading...`, `#REF!`,
`#N/A`, `#ERROR!`), the feature simply hides itself and the rest of the
dashboard renders normally — no console errors.

**Budget pacing scope (important):** the pacing section is **current calendar
month only** and is matched at the **client level** (not per-campaign). It is
deliberately independent of the 7/30/90/custom time tabs — budgets come from the
tracker (a daily-overwritten MTD snapshot) while spend MTD is computed from the
live feed, anchored to the feed's latest date. The Original ▸ Revised toggle
flips which budget column every number paces against.

**GA4 feed switch:** when `GID_FEED_GA4` is set, that tab *replaces* the bare FB
sheet as the campaign-day feed (it carries both Meta and GA4 revenue). GA4 UI is
feature-detected from a non-trivial `LC Revenue (GA4)` column, so a feed without
real GA4 numbers stays Meta-only.

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

### Optional tabs

These are read only if their GID constant is set (see Configuration). All are
parsed defensively (header-detected columns, IMPORTRANGE transients skipped).

**Client Mapping (Import)** — header row 1, columns located by name:

| Client Name | Meta OR TikTok Ad Account | GA4 Property Name |
|---|---|---|

An ad account that serves several region-specific clients (e.g. *Sting AU / US /
UK / DE* on one Meta account) is keyed `account + '|' + region` so each region
resolves to the right client. Region is taken from an explicit `Region` column
if present, otherwise derived from the client name via `getRegion()`.

**Campaign Feed GA4 (Import)** — mirrors `Data Import New`:

| Date | Month | Meta Ads Account | Campaign | Region | Spends | Meta Ads Revenue | Facebook ROAS | LC Revenue (GA4) | LC ROAS |
|---|---|---|---|---|---|---|---|---|---|

`LC Revenue (GA4)` becomes the per-row `lcRevenue` used for GA4 ROAS.

**Budget Tracker (Import)** — mirrors `NEW Budget Tracker`. A metadata block,
then repeating client blocks. The parser skips to the row whose first cell is
exactly `Client`, tracks the current client, and reads each client's totals from
its `All Campaign Spend` subtotal row:

| col 0 | col 1 | col 2 | col 3 | col 4 | col 8 | col 9 |
|---|---|---|---|---|---|---|
| Client | Campaign Name | Original Budget | Revised Budget | Spend MTD | Revenue LC MTD | Revenue META MTD |

Client names contain embedded newlines and region suffixes (`"STING AU + US + UK
+ DE"`); `normalizeClientKey()` collapses these to a join key so tracker labels
match the dashboard's client names. Add bridges to the `CLIENT_ALIASES` map in
`index.html` for any labels that don't collapse automatically. Blank budgets are
treated as "no budget set" (excluded from pacing); `#DIV/0!` and other error
strings coerce to null.

---

## Known limitations

- **Spend duplication** (fixed when `GID_MAPPING` is set): `Sting Sports Main Ad
  Account` maps to four clients (Sting AU/US/UK/DE) on one FB ad account. With
  the Client Mapping tab wired up, spend is keyed on `account + '|' + region` so
  each region resolves correctly; without it, the legacy last-write-wins applies
  (shows as "Sting DE"). Region detection must distinguish the regions in play —
  `getRegion()` now covers AU/NZ/US/UK/DE/ANZ; if campaign/account names don't
  carry a region token, those rows default to AU and same-region duplicates fall
  back to first-match (logged via `console.warn`).
- **Region detection** uses regex on the account/campaign name. Most patterns
  in the current sheet are covered (`| NZ |`, `-NZ-`, `USA`, etc.), but
  unusual naming will fall into `AU` by default.
- **Objective detection** uses keyword matching. Campaigns whose name doesn't
  contain `Retargeting`, `Prospecting`, `Awareness`, `Traffic`, `DPA`,
  `Advantage`, `Conversion`, `Video` etc. land in `Other`.
- **GA4 metrics** require the `Campaign Feed GA4 (Import)` tab (`GID_FEED_GA4`).
  Without it the dashboard is Meta-attributed only, as before.
- **Browser-only**. There's no backend storing anything. State persists only
  in the URL hash.

---

## Roadmap ideas

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
