# Spend Sense

> **An AI-readable personal finance layer for Nigerians.**

Most finance apps in Nigeria fail because they need bank integrations users don't trust or banks don't expose. Spend Sense starts with what Nigerians already have: **transaction alerts**. It turns messy SMS and email alerts into structured financial intelligence — and exposes it through MCP so any AI assistant can help you understand your money.

**Live:** [spendsense.mpaukwu.tech](https://spendsense.mpaukwu.tech)
Built for **World Product Day 2026** · `#EveryoneShipsNow`

---

## What it does

Paste the alerts your bank already sends you. Spend Sense parses them instantly, categorizes every transaction, and shows you a full spending dashboard — no bank login, no account linking, no data stored permanently.

```
You just sent ₦35,000.00 to Christian Onuh - Foodstuff. Love, The Kuda Team.
Your transfer of ₦11,000.00 is successful. Name: NNPC Filling Station Bank: Moniepoint
Your transaction of 74.14 USD to DIGITALOCEAN.COM was successful. Bybit Card.
Glo data ₦3,000 recharge successful
DStv subscription of ₦12,400 successful
```
↓
**Categorized dashboard. Spend Score. Budget tracker. Timeline. Subscription detector.**

---

## Supported banks & channels

| Bank / Channel | Alert format |
|---|---|
| Kuda | Email + SMS |
| OPay | Email |
| Moniepoint | Email + SMS |
| Nala | Email |
| Bybit | Email (USD → NGN conversion) |
| GTBank | SMS |
| Access Bank | SMS |
| FirstBank | SMS |
| MTN / Glo / Airtel / 9mobile | SMS (airtime, data, transfers) |

USD alerts are automatically converted to NGN at a configurable exchange rate — set it to today's rate before analyzing.

---

## Features

| Feature | Description |
|---|---|
| **Gmail import** | One-click OAuth — pulls 90 days of bank alerts automatically |
| **16 categories** | Housing, Food, Transport, Telecom, Betting & Gaming, Crypto, Health, and more |
| **Spend Score** | Personalized 300–850 score with tweakable weights |
| **Budget tracker** | Per-category monthly limits, stored in localStorage |
| **Savings calculator** | Drag sliders to see projected annual savings |
| **Spending timeline** | Weekly SVG bar chart (powered by email dates) |
| **Unusual transactions** | Flags anything 3× your typical spend |
| **Subscription detector** | Recurring and known-SaaS payment detection |
| **Date range filter** | All / 1W / 1M / 3M — all charts respond instantly |
| **CSV + JSON export** | Opens directly in Google Sheets |
| **Share link** | Session URLs work for 24 hours, shareable with anyone |
| **MCP server** | AI assistants can query your spending in plain English |

---

## Privacy posture

- **No permanent storage.** Sessions live in memory for 24 hours, then are purged automatically.
- **Account numbers are redacted** before any data is stored — `Account Number: 5951399598` becomes `Account •••`.
- **Nothing leaves your browser** on the paste-in path. The parser runs entirely client-side.
- **Gmail OAuth is read-only** (`gmail.readonly` scope). Spend Sense cannot send, delete, or modify emails.
- **You control what you share.** The AI assistant path only runs when you explicitly trigger it. Session URLs are unguessable UUIDs.
- No analytics beyond anonymous Novus/Pendo session events (page views, feature usage — no PII).

---

## MCP server

Spend Sense exposes an MCP (Model Context Protocol) server at `https://spendsense.mpaukwu.tech/mcp`.

Connect it to your AI assistant and ask questions in plain English:

| Prompt | Tool called |
|---|---|
| *"What did I spend most on this week?"* | `get_summary` |
| *"Find subscriptions I forgot about."* | `find_subscriptions` |
| *"Which transactions look unusual?"* | `find_unusual` |
| *"Summarize my June cash flow."* | `get_summary` |
| *"Load these alerts and show me a dashboard."* | `load_alerts` |

### Available tools

| Tool | Description |
|---|---|
| `load_alerts` | Parse raw Nigerian bank alert text → session + dashboard URL |
| `get_summary` | Totals and top categories for a session |
| `find_subscriptions` | Detect recurring/subscription payments |
| `find_unusual` | Flag transactions 3× above your typical spend |
| `list_supported_banks` | List recognized alert formats |

---

## Connect to your AI assistant

### Claude.ai (Pro / Max / Team / Enterprise)
Settings → **Connectors** → **Add custom connector** → paste:
```
https://spendsense.mpaukwu.tech/mcp
```

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "spend-sense": {
      "command": "npx",
      "args": ["mcp-remote", "https://spendsense.mpaukwu.tech/mcp"]
    }
  }
}
```

### Cursor
Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally):
```json
{
  "mcpServers": {
    "spend-sense": {
      "url": "https://spendsense.mpaukwu.tech/mcp"
    }
  }
}
```

### Windsurf
Open Cascade settings → Manage MCP Servers, or edit `mcp_config.json`:
```json
{
  "mcpServers": {
    "spend-sense": {
      "serverUrl": "https://spendsense.mpaukwu.tech/mcp"
    }
  }
}
```

### OpenAI Codex
```bash
codex mcp add spend-sense --url https://spendsense.mpaukwu.tech/mcp
```
Or add to `~/.codex/config.toml`:
```toml
[mcp_servers.spendsense]
url = "https://spendsense.mpaukwu.tech/mcp"
```

### Continue.dev
Add to `.continue/config.yaml`:
```yaml
mcpServers:
  - name: SpendSense
    type: streamable-http
    url: https://spendsense.mpaukwu.tech/mcp
```

### OpenAI Responses API
```json
{
  "tools": [{
    "type": "mcp",
    "server_label": "spend-sense",
    "server_url": "https://spendsense.mpaukwu.tech/mcp",
    "require_approval": "never"
  }]
}
```

---

## Accuracy

Tested against 30 real Nigerian bank alerts across 9 banks and channels:

| Metric | Result |
|---|---|
| Amount extraction | 97% (29/30) |
| Direction (in/out) | 93% (28/30) |
| Category assignment | 87% (26/30) |
| Party name extraction | 90% (27/30) |

**Known limitations:**
- Informal merchant descriptions (e.g. "transfer to Emeka") default to "Transfers & Cash"
- Some GTBank SMS formats use non-standard amount encoding
- Multi-currency alerts (USD + NGN in same message) take the first amount found

---

## Run locally

```bash
npm install
npm start
# → http://localhost:3000
```

### Docker
```bash
docker build -t spend-sense .
docker run -p 3000:3000 \
  -e PUBLIC_BASE=http://localhost:3000 \
  spend-sense
```

### Deploy to Coolify
1. New Resource → Application → point to this repo
2. Coolify detects `Dockerfile` automatically
3. Set environment variables:

| Variable | Description |
|---|---|
| `PUBLIC_BASE` | Your domain e.g. `https://spendsense.mpaukwu.tech` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth credentials |
| `NODE_ENV` | `production` |

---

## Project structure

```
spend-sense/
├── public/
│   └── index.html      # Full dashboard — no build step
├── server.js           # Express + MCP server
├── parser.js           # Parsing, categorization, analytics
├── .mcp.json           # Project-scoped MCP registration
├── Dockerfile
└── package.json
```

---

## License

MIT
