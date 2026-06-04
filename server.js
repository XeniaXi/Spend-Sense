// Spend Sense — MCP server + web host
// One Node service does three jobs:
//   1. Serves the web dashboard (public/)
//   2. Exposes an MCP server at /mcp so an AI assistant can push alerts in & query insights
//   3. Exposes a tiny session API the dashboard reads to hydrate from an MCP session
//
// The big idea: the assistant already has the user's email connected. It fetches the
// bank alerts and calls load_alerts here — Spend Sense never sees a bank login or inbox.

import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { parse, summarize, findSubscriptions, findUnusual } from "./parser.js";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Fire a server-side Pendo track event (non-fatal; skipped if PENDO_INTEGRATION_KEY is unset).
async function pendoTrack(event, visitorId, properties = {}) {
  const key = process.env.PENDO_INTEGRATION_KEY;
  if (!key) return;
  try {
    await fetch("https://app.pendo.io/data/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": key },
      body: JSON.stringify({ type: "track", event, visitorId, timestamp: Date.now(), properties })
    });
  } catch (_) { /* non-fatal */ }
}
// Set PUBLIC_BASE to your deployed URL (e.g. https://spend.mpaukwu.com) so the
// dashboard links the assistant returns are clickable.
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;

// --- ephemeral session store (swap for Redis/Postgres in production) ---
const SESSIONS = new Map(); // id -> { tx, createdAt }
const TTL_MS = 1000 * 60 * 60 * 24; // 24h
function saveSession(tx){
  const id = randomUUID().slice(0, 8);
  SESSIONS.set(id, { tx, createdAt: Date.now() });
  return id;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS) if (now - s.createdAt > TTL_MS) SESSIONS.delete(id);
}, 60 * 60 * 1000).unref();

// --- MCP server definition (fresh instance per request = stateless) ---
function buildMcpServer(){
  const server = new McpServer({ name: "spend-sense", version: "1.0.0" });

  server.registerTool("load_alerts", {
    title: "Load bank alerts",
    description: "Parse raw Nigerian bank/transaction alert text (Kuda, Opay, Moniepoint, Nala, Bybit, telco) into a categorized spending session. Returns a clickable dashboard URL plus a summary. Pass the alerts exactly as they appear in email or SMS.",
    inputSchema: { alerts: z.string().min(3).describe("Raw alert text, one or many, newline separated"),
                   fxRate: z.number().optional().describe("USD→NGN rate for any $ alerts (default 1600)") }
  }, async ({ alerts, fxRate }) => {
    const tx = parse(alerts, fxRate || 1600);
    if (!tx.length) return { content: [{ type: "text", text: "No transactions could be parsed from that text." }] };
    const id = saveSession(tx);
    const sum = summarize(tx);
    pendoTrack("mcp_alerts_loaded", "mcp-agent", { count: sum.count, moneyIn: sum.moneyIn, moneyOut: sum.moneyOut });
    const out = { sessionId: id, dashboardUrl: `${PUBLIC_BASE}/?s=${id}`,
      count: sum.count, moneyIn: sum.moneyIn, moneyOut: sum.moneyOut, net: sum.net };
    return { content: [{ type: "text", text:
      `Parsed ${sum.count} transactions. In ₦${sum.moneyIn.toLocaleString()}, out ₦${sum.moneyOut.toLocaleString()}.\nDashboard: ${out.dashboardUrl}` }],
      structuredContent: out };
  });

  server.registerTool("get_summary", {
    title: "Get spending summary",
    description: "Return totals (in/out/net) and the top spending categories for a session created by load_alerts.",
    inputSchema: { sessionId: z.string().describe("Session id from load_alerts") }
  }, async ({ sessionId }) => {
    const s = SESSIONS.get(sessionId);
    if (!s) return { content: [{ type: "text", text: "Session not found or expired." }] };
    const sum = summarize(s.tx);
    pendoTrack("mcp_summary_queried", "mcp-agent", { sessionId });
    return { content: [{ type: "text", text: JSON.stringify(sum, null, 2) }], structuredContent: sum };
  });

  server.registerTool("find_subscriptions", {
    title: "Find recurring & subscriptions",
    description: "Detect likely recurring payments and subscriptions (repeated merchants or known SaaS/bills) in a session.",
    inputSchema: { sessionId: z.string() }
  }, async ({ sessionId }) => {
    const s = SESSIONS.get(sessionId);
    if (!s) return { content: [{ type: "text", text: "Session not found or expired." }] };
    const subs = findSubscriptions(s.tx);
    const total = subs.reduce((a,x)=>a+x.total,0);
    pendoTrack("mcp_subscriptions_queried", "mcp-agent", { sessionId, count: subs.length, total });
    return { content: [{ type: "text", text:
      `Found ${subs.length} recurring/subscription items totalling ₦${total.toLocaleString()}:\n` +
      subs.map(x=>`• ${x.merchant} — ₦${x.total.toLocaleString()} (${x.occurrences}x, ${x.reason})`).join("\n") }],
      structuredContent: { subscriptions: subs, total } };
  });

  server.registerTool("find_unusual", {
    title: "Find unusual transactions",
    description: "Flag transactions that are significantly larger than the user's typical spend — potential errors, fraud, or forgotten charges.",
    inputSchema: { sessionId: z.string() }
  }, async ({ sessionId }) => {
    const s = SESSIONS.get(sessionId);
    if (!s) return { content: [{ type: "text", text: "Session not found or expired." }] };
    const unusual = findUnusual(s.tx);
    if (!unusual.length) return { content: [{ type: "text", text: "No unusual transactions detected — all spend looks consistent with your normal patterns." }] };
    return { content: [{ type: "text", text:
      `Found ${unusual.length} unusual transaction(s):\n` +
      unusual.map(t => `• ${t.party} — ₦${Math.round(t.amount).toLocaleString()} (${t.reason})`).join("\n") }],
      structuredContent: { unusual } };
  });

  server.registerTool("list_supported_banks", {
    title: "List supported banks",
    description: "List the Nigerian banks and channels whose alert formats Spend Sense recognizes.",
    inputSchema: {}
  }, async () => ({ content: [{ type: "text",
    text: "Kuda, Opay, Moniepoint, Nala, Bybit, GTBank, Access, FirstBank, and telco alerts (MTN/Glo/Airtel/9mobile)." }] }));

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// MCP endpoint (stateless Streamable HTTP)
app.post("/mcp", async (req, res) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e) });
  }
});
app.get("/mcp", (_req, res) => res.status(405).json({ error: "Use POST for MCP" }));

// Simple ingest (for non-MCP callers / testing): POST { text, fxRate } -> session
app.post("/api/ingest", (req, res) => {
  const { text, fxRate } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });
  const tx = parse(text, fxRate || 1600);
  if (!tx.length) return res.status(422).json({ error: "no transactions parsed" });
  const id = saveSession(tx);
  const sum = summarize(tx);
  pendoTrack("api_alerts_ingested", "api-client", { count: sum.count, moneyIn: sum.moneyIn, moneyOut: sum.moneyOut });
  res.json({ sessionId: id, url: `${PUBLIC_BASE}/?s=${id}`, ...sum });
});

// Dashboard reads this to hydrate from an MCP/ingest session
app.get("/api/session/:id", (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  res.json({ tx: s.tx, summary: summarize(s.tx) });
});

app.get("/healthz", (_req, res) => res.send("ok"));

// --- Gmail OAuth import ---
const GMAIL_REDIRECT = `${PUBLIC_BASE}/auth/gmail/callback`;
function gmailOAuth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GMAIL_REDIRECT
  );
}

app.get("/auth/gmail", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).send("Gmail import not configured.");
  const auth = gmailOAuth2();
  const url = auth.generateAuthUrl({
    access_type: "online",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    prompt: "select_account",
  });
  res.redirect(url);
});

app.get("/auth/gmail/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect("/?error=gmail_denied");
  try {
    const auth = gmailOAuth2();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth });
    const BANK_QUERY =
      "(from:kuda OR from:opay OR from:moniepoint OR from:nala OR from:bybit OR " +
      "from:gtbank OR from:accessbank OR from:firstbank OR " +
      'subject:"transfer successful" OR subject:"debit alert" OR subject:"credit alert") newer_than:90d';

    const listRes = await gmail.users.messages.list({ userId: "me", q: BANK_QUERY, maxResults: 100 });
    const messages = listRes.data.messages || [];
    if (!messages.length) return res.redirect("/?error=no_alerts");

    // Fetch snippet + internalDate per message — minimal is fast, internalDate gives us real email timestamps
    const msgs = await Promise.all(
      messages.slice(0, 100).map(m =>
        gmail.users.messages.get({ userId: "me", id: m.id, format: "minimal" })
          .then(r => ({
            snippet: r.data.snippet || "",
            date: r.data.internalDate
              ? new Date(parseInt(r.data.internalDate)).toISOString().slice(0, 10)
              : null
          }))
          .catch(() => ({ snippet: "", date: null }))
      )
    );

    // Parse each message individually so we can attach the real email date
    const fxRate = parseFloat(process.env.FX_RATE) || 1600;
    const tx = msgs.flatMap(({ snippet, date }) => {
      if (!snippet) return [];
      const parsed = parse(snippet, fxRate);
      if (date) parsed.forEach(t => { t.date = t.date || date; });
      return parsed;
    });
    if (!tx.length) return res.redirect("/?error=no_transactions");

    const id = saveSession(tx);
    res.redirect(`/?s=${id}&source=gmail&count=${tx.length}`);
  } catch (e) {
    console.error("Gmail import error:", e.message);
    res.redirect("/?error=gmail_failed");
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`Spend Sense on :${PORT}  (MCP at /mcp)`));
