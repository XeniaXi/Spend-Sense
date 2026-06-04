# Spend Sense

> **Where did your Naira go?**

A Nigerian spend tracker that turns bank alert texts into a categorized spending dashboard — no bank login, no account linking. Just paste the alerts your bank already sends you.

Built for **World Product Day** · `#EveryoneShipsNow`

---

## What it does

- Parses raw transaction alerts from **Kuda, Opay, Moniepoint, Nala, Bybit, GTBank, Access, FirstBank, and telco (MTN/Glo/Airtel/9mobile)**
- Categorizes spending into 15 categories (Food, Transport, Telecom, Housing, etc.)
- Detects recurring payments and subscriptions
- Converts USD alerts to NGN at a configurable exchange rate
- Works entirely in the browser — nothing leaves your device unless you use the MCP path

### MCP integration

Spend Sense also runs as an **MCP (Model Context Protocol) server** at `/mcp`. An AI assistant (Claude, etc.) with your email connected can call `load_alerts` to push your bank alerts in and get back a live dashboard URL — you never hand your inbox or bank credentials to the app.

**MCP tools exposed:**

| Tool | What it does |
|------|-------------|
| `load_alerts` | Parse raw alert text → session + dashboard URL |
| `get_summary` | Totals and top categories for a session |
| `find_subscriptions` | Detect recurring / subscription payments |
| `list_supported_banks` | List recognized alert formats |

---

## Getting started

### Run locally

```bash
npm install
npm start
# → http://localhost:3000
```

### Docker

```bash
docker build -t spend-sense .
docker run -p 3000:3000 spend-sense
```

### Deploy to Coolify

1. New Resource → Application → point to this repo
2. Coolify detects the `Dockerfile`, builds, and exposes port `3000`
3. Set the `PUBLIC_BASE` environment variable to your final URL (e.g. `https://spend.yourdomain.com`) so MCP dashboard links are clickable

---

## API

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/mcp` | `POST` | MCP JSON-RPC | MCP server endpoint |
| `/api/ingest` | `POST` | `{ text, fxRate? }` | Parse alerts, get session |
| `/api/session/:id` | `GET` | — | Fetch session data for dashboard |
| `/healthz` | `GET` | — | Health check |

---

## Project structure

```
spend-sense/
├── public/
│   └── index.html      # Single-page dashboard (no build step)
├── server.js           # Express + MCP server
├── parser.js           # Parsing & analytics logic (shared)
├── Dockerfile
└── package.json
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
| `PUBLIC_BASE` | `http://localhost:3000` | Base URL for dashboard links returned by MCP tools |

---

## Supported alert formats (examples)

```
You just sent ₦35,000.00 to Christian Onuh - Foodstuff. Love, The Kuda Team.
Your transfer of ₦11,000.00 is successful. Name: NNPC Filling Station Bank: Moniepoint
Your transaction of 74.14 USD to DIGITALOCEAN.COM was successful. Bybit Card.
Glo data ₦3,000 recharge successful
DStv subscription of ₦12,400 successful
```

---

## License

MIT
