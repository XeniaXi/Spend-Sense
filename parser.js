// Spend Sense — shared parsing & analytics brain (ESM)
// Used by the MCP server and the /api/ingest endpoint so the AI-assistant path
// and the paste-in-browser path produce identical results.

export const CATS = ["Housing","Education","Food & Dining","Transport & Fuel","Telecom & Data",
  "Utilities & Bills","Marketing & Ads","Infrastructure / SaaS","Crypto & Trading",
  "Shopping","Health","Betting & Gaming","Transfers & Cash","Fees & Charges","Income","Uncategorized"];

const RULES = [
  ["Housing",/rent|landlord|apartment|accommodation|lease/i],
  ["Education",/school|tuition|fee|lesson|exam|greenoak|college|waec|jamb/i],
  ["Food & Dining",/food|restaurant|eatery|kitchen|chicken|pizza|foodco|\bmarket\b|grocer|supermarket|cafe|bukka|shoprite/i],
  ["Transport & Fuel",/fuel|petrol|filling|nnpc|ardova|diesel|bolt|uber|transport|fare|brt|fuelling/i],
  ["Telecom & Data",/mtn|glo|airtel|9mobile|airtime|\bdata\b|recharge|\bvtu\b/i],
  ["Utilities & Bills",/phcn|ekedc|phed|ikedc|electric|dstv|gotv|startimes|\bwater\b|waste|nepa|prepaid/i],
  ["Marketing & Ads",/facebook\s?ads|facebookads|google\s?ads|\bmeta\b|\bads\b|marketing|boost|campaign/i],
  ["Infrastructure / SaaS",/digitalocean|vercel|\baws\b|amazon web|cloud|hosting|github|openai|anthropic|server|domain|namecheap|netlify/i],
  ["Crypto & Trading",/bybit|binance|usdt|crypto|\bp2p\b|luno|quidax|busd|stablecoin/i],
  ["Betting & Gaming",/bet9ja|sportybet|1xbet|betking|betway|nairabet|bangbet|msport|parimatch|\bbet\b|\bbetting\b|casino|jackpot|lottery/i],
  ["Shopping",/jumia|konga|\bstore\b|\bmall\b|fashion|temu|amazon|boutique|aliexpress/i],
  ["Health",/hospital|pharmacy|chemist|clinic|\bdrug|medical|health|optical/i],
  ["Fees & Charges",/\bfee\b|charge|levy|stamp|\bvat\b|commission|sms charge|maintenance/i],
  ["Transfers & Cash",/\bpos\b|withdraw|\batm\b|cash|transfer/i],
];

// Things that are inherently recurring even if they appear once
const SUB_KEYWORDS = /dstv|gotv|startimes|netflix|spotify|youtube premium|apple|google one|digitalocean|vercel|\baws\b|github|openai|anthropic|canva|adobe|microsoft|figma|notion|linkedin|prime|subscription/i;

export function categorize(t){ for (const [c,re] of RULES) if (re.test(t)) return c; return "Uncategorized"; }

// Redact account numbers and sensitive numeric strings before storing
function redact(s){
  return s
    .replace(/\bAccount\s*(?:Number|No\.?)?\s*:?\s*\d{6,}/gi, 'Account •••')
    .replace(/\b\d{10,}\b/g, '•••')  // any standalone 10+ digit number
    .replace(/\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b/g, '•••• •••• •••• ••••'); // card numbers
}
function clean(s){ return redact(s.replace(/\s+/g,' ').replace(/[-–]\s*$/,'').trim().slice(0,60)).slice(0,42); }

function parseAmount(line, fx){
  let m = line.match(/(?:₦|NGN|N(?=\s?[\d]))\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return { amount: parseFloat(m[1].replace(/,/g,'')), fx:false };
  m = line.match(/([\d,]+(?:\.\d{1,2})?)\s?(?:USD|\$)/i) || line.match(/(?:USD|\$)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return { amount: parseFloat(m[1].replace(/,/g,'')) * fx, fx:true };
  return null;
}
function parseParty(line){
  let m = line.match(/Name:\s*([^\n]+?)(?:\s*Bank:|$)/i); if (m) return clean(m[1]);
  m = line.match(/^([A-Za-z0-9 .'&\-]+?)\s+just sent you/i); if (m) return clean(m[1]);
  m = line.match(/\bto\s+([^.\n]+?)(?:\s+[-–]\s+|\.|\bon\b|$)/i); if (m) return clean(m[1]);
  m = line.match(/\bfrom\s+([^.\n]+?)(?:\.|\bon\b|$)/i); if (m) return clean(m[1]);
  m = line.match(/\b(MTN|Glo|Airtel|9mobile|DStv|GOtv|StarTimes|NNPC|Ardova)\b/i); if (m) return m[1];
  return "Unknown";
}
function direction(line){
  if (/sent you|just sent you|credited|\bCR\b|received|payment from|\bfrom\b|deposit|refund/i.test(line)
      && !/you sent|you just sent/i.test(line)) return "in";
  return "out";
}
function detectSource(line){
  if (/kuda/i.test(line)) return "Kuda"; if (/opay/i.test(line)) return "Opay";
  if (/monie\s?point/i.test(line)) return "Moniepoint"; if (/bybit/i.test(line)) return "Bybit";
  if (/nala/i.test(line)) return "Nala"; if (/\bgt(bank)?\b/i.test(line)) return "GTBank";
  if (/access/i.test(line)) return "Access"; if (/first\s?bank/i.test(line)) return "FirstBank";
  if (/\b(mtn|glo|airtel|9mobile)\b/i.test(line)) return "Telco";
  return "Other";
}
function splitBlocks(text){
  let b = text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  if (b.length <= 1) b = text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  return b;
}

export function parse(text, fx = 1600){
  return splitBlocks(text).map(b => {
    const a = parseAmount(b, fx); if (!a) return null;
    return { amount: a.amount, dir: direction(b), party: parseParty(b),
      category: categorize(b), source: detectSource(b), fx: a.fx };
  }).filter(Boolean);
}

export function summarize(tx){
  const inSum  = tx.filter(t=>t.dir==='in').reduce((s,t)=>s+t.amount,0);
  const outSum = tx.filter(t=>t.dir==='out').reduce((s,t)=>s+t.amount,0);
  const byCat = {};
  tx.filter(t=>t.dir==='out').forEach(t=>byCat[t.category]=(byCat[t.category]||0)+t.amount);
  const topCategories = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
    .map(([category,amount])=>({category, amount, pct: outSum?Math.round(amount/outSum*100):0}));
  return { count: tx.length, moneyIn: inSum, moneyOut: outSum, net: inSum-outSum, topCategories };
}

export function findUnusual(tx){
  const out = tx.filter(t => t.dir === 'out');
  if (out.length < 3) return [];
  const sorted = [...out].sort((a,b) => a.amount - b.amount);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[mid].amount
    : (sorted[mid-1].amount + sorted[mid].amount) / 2;
  const threshold = Math.max(median * 3, 5000); // 3× median or ₦5k minimum
  return out
    .filter(t => t.amount >= threshold)
    .sort((a,b) => b.amount - a.amount)
    .map(t => ({ ...t, reason: `₦${Math.round(t.amount).toLocaleString()} is ${Math.round(t.amount/median)}× your typical spend` }));
}

export function findSubscriptions(tx){
  const out = tx.filter(t=>t.dir==='out');
  const counts = {};
  out.forEach(t=>{ const k=t.party.toLowerCase(); (counts[k]=counts[k]||[]).push(t); });
  const subs = [];
  for (const k in counts){
    const group = counts[k];
    const isKeyword = SUB_KEYWORDS.test(group[0].party) || group.some(g=>SUB_KEYWORDS.test(g.category));
    const isRepeated = group.length >= 2;
    if (isKeyword || isRepeated){
      subs.push({ merchant: group[0].party, category: group[0].category,
        occurrences: group.length, total: group.reduce((s,g)=>s+g.amount,0),
        reason: isKeyword ? 'known subscription' : 'repeats' });
    }
  }
  return subs.sort((a,b)=>b.total-a.total);
}
