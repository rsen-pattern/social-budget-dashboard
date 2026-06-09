# n8n — Daily Social Budget Slack Alerts

An importable n8n workflow that posts a daily Slack digest of budget pacing,
wasted spend, and low-ROAS clients — sourced from the same published Google
Sheet the dashboard uses, so the numbers always match.

**File:** [`social-budget-slack-alerts.json`](./social-budget-slack-alerts.json)

## What it does

```
Weekday 8am (cron)  →  Fetch Budget Tracker CSV  →  Parse & Classify  →  Post to Slack
```

It reads the **Budget Tracker (Import)** tab (`gid=574177160`) — which already
carries `Spend MTD`, `% Spend Pacing`, both revenue columns, both ROAS columns,
and a `Time Pacing` metadata cell — so the whole thing runs off a **single HTTP
fetch**. No Meta/GA4 API, no OAuth, no feed/mapping join.

One Slack message is posted each weekday. It always includes a portfolio
**digest** (time pacing, spend vs budget, blended ROAS) and then only the
sections that have something to flag:

| Section | Fires when |
|---|---|
| 🔴 Overpacing | spend % of budget exceeds time pacing by **> 5 pts** |
| 🟡 Underpacing | spend % trails time pacing by **> 10 pts** |
| 💸 Wasted spend | **> $500** spent with **~$0** combined revenue |
| 📉 Low META ROAS | META ROAS reported and **< 1.0×** (on > $500 spend) |

If nothing trips, it posts `✅ All clients within pacing / ROAS thresholds.`

## Import & setup

1. In n8n: **Workflows → Import from File** → choose
   `social-budget-slack-alerts.json`.
2. Open the **Post to Slack** node and pick (or create) your Slack credential.
3. Set the channel on that node (defaults to `#social-budget-alerts`).
4. Click **Execute Workflow** once to test — you'll get the digest in Slack
   immediately. Then toggle the workflow **Active**.

The schedule is `0 8 * * 1-5` (08:00, Mon–Fri, in the n8n instance's timezone).

## Tuning

All thresholds live as `const`s at the top of the **Parse & Classify** Code
node — edit them in the n8n UI, no redeploy needed:

```js
const OVERPACE_PTS    = 0.05;      // overpacing margin (5 pts)
const UNDERPACE_PTS   = 0.10;      // underpacing margin (10 pts)
const WASTE_MIN_SPEND = 500;       // $ floor for wasted-spend / low-ROAS
const ROAS_FLOOR      = 1.0;       // low-ROAS trigger
const BUDGET_MODE     = 'revised'; // 'revised' | 'original'
```

### Notes

- **Lead-gen clients** legitimately show `$0` ecom revenue and blank ROAS, so
  the wasted-spend and low-ROAS checks deliberately skip blank-ROAS clients and
  only flag genuine spend-with-no-revenue. Tighten `WASTE_MIN_SPEND` if you want
  fewer/more flags.
- **Want intraday pacing checks too?** Duplicate the workflow, change the cron
  (e.g. `0 */4 * * 1-5`), and in the Code node return early unless
  `counts.over` / `counts.under` is non-zero so it only pings when pacing
  actually slips — keeping the full digest on the once-a-day version.
- The CSV URL is pinned to the published sheet in the **Fetch Budget Tracker
  CSV** node; update it there if the sheet is ever re-published.
