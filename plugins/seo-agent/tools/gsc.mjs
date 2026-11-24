// Google Search Console via REST (service-account JWT, no dependencies).
// Credentials: GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON or base64)  or  GOOGLE_APPLICATION_CREDENTIALS (file path)
// node gsc.mjs sites | performance [days] | inspect [url ...] [--sitemap 20] | sitemaps | submit-sitemap [url]
import crypto from "node:crypto";
import fs from "node:fs";
import { config, SITE, args, targetUrls, saveReport, sleep, redact } from "./lib.mjs";

function creds() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    raw = raw.trim();
    if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(raw);
  }
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  console.error("✗ Google credentials not set. Set GOOGLE_SERVICE_ACCOUNT_JSON (cloud) or GOOGLE_APPLICATION_CREDENTIALS (local file path) in .env.seo. See reference/setup-google.md");
  process.exit(3);
}
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function accessToken() {
  const c = creds();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: c.client_email, scope: "https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))}`;
  const sig = b64url(crypto.createSign("RSA-SHA256").update(unsigned).sign(c.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`token error: ${j.error_description || j.error || res.status}`);
  return { token: j.access_token, email: c.client_email };
}
let AUTH;
async function api(method, url, body) {
  AUTH ||= await accessToken();
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${AUTH.token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  return j;
}
const WM = "https://www.googleapis.com/webmasters/v3";
const property = config.gscProperty;
const enc = encodeURIComponent;
const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
async function query(dimensions, days, rowLimit = 1000) {
  const j = await api("POST", `${WM}/sites/${enc(property)}/searchAnalytics/query`, { startDate: day(days + 3), endDate: day(3), dimensions, rowLimit });
  return (j.rows || []).map((x) => ({ ...Object.fromEntries(dimensions.map((d, i) => [d, x.keys[i]])), clicks: x.clicks, impressions: x.impressions, ctr: +(x.ctr * 100).toFixed(2), position: +x.position.toFixed(1) }));
}

const cmd = args[0] || "performance";
try {
  if (cmd === "sites") {
    const j = await api("GET", `${WM}/sites`);
    const list = (j.siteEntry || []).map((s) => ({ property: s.siteUrl, permission: s.permissionLevel }));
    console.log(`Service account: ${AUTH.email}`);
    if (!list.length) console.log("No properties visible. Add the service-account email as a user in Search Console (Settings > Users and permissions).");
    else console.table(list);
    const match = list.find((s) => s.property === property);
    console.log(match ? `✓ config.gscProperty "${property}" is accessible (${match.permission}).` : `✗ config.gscProperty "${property}" is NOT in this list. Use one of the properties above.`);
  } else if (cmd === "performance") {
    const days = Number(args[1]) || 28;
    const [queries, pages, qp] = await Promise.all([query(["query"], days, 500), query(["page"], days, 500), query(["query", "page"], days, 2000)]);
    const total = pages.reduce((m, p) => ({ clicks: m.clicks + p.clicks, impressions: m.impressions + p.impressions }), { clicks: 0, impressions: 0 });
    const striking = qp.filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= (config.strikingMinImpressions || 20)).sort((a, b) => b.impressions - a.impressions).slice(0, 40);
    const lowCtr = pages.filter((p) => p.position <= 10 && p.impressions >= 100 && p.ctr < 2).sort((a, b) => b.impressions - a.impressions).slice(0, 20);
    console.log(`Last ${days} days: ${total.clicks} clicks, ${total.impressions} impressions`);
    console.log("\nTop queries:"); console.table(queries.slice(0, 15));
    console.log("\nStriking distance (position 4-20):"); console.table(striking.slice(0, 15));
    console.log("\nLow CTR (top 10, CTR < 2%):"); console.table(lowCtr.slice(0, 10));
    saveReport("gsc-performance", { generatedAt: new Date().toISOString(), days, total, queries, pages, striking, lowCtr });
  } else if (cmd === "inspect") {
    const urls = await targetUrls(20);
    const out = [];
    for (const url of urls) {
      try {
        const j = await api("POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: url, siteUrl: property, languageCode: "en-US" });
        const ir = j.inspectionResult || {}; const s = ir.indexStatusResult || {};
        out.push({ url, verdict: s.verdict, coverage: s.coverageState, robots: s.robotsTxtState, fetch: s.pageFetchState, lastCrawl: s.lastCrawlTime, googleCanonical: s.googleCanonical, userCanonical: s.userCanonical, richResults: (ir.richResultsResult?.detectedItems || []).map((d) => d.richResultType) });
        console.log(`${s.verdict === "PASS" ? "✓" : "✗"} ${url} -> ${s.coverageState}`);
      } catch (e) { out.push({ url, error: e.message }); console.log(`! ${url} -> ${e.message}`); }
      await sleep(400);
    }
    const notIndexed = out.filter((o) => o.verdict !== "PASS");
    console.log(`\n${out.length - notIndexed.length}/${out.length} indexed.`);
    if (notIndexed.length) console.log("Not-indexed URLs: the user must click 'Request indexing' in the Search Console UI (no public API for this).");
    saveReport("gsc-inspect", { generatedAt: new Date().toISOString(), results: out, notIndexed });
  } else if (cmd === "sitemaps") {
    const j = await api("GET", `${WM}/sites/${enc(property)}/sitemaps`);
    const list = (j.sitemap || []).map((s) => ({ path: s.path, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, pending: s.isPending, errors: s.errors, warnings: s.warnings }));
    console.table(list);
    saveReport("gsc-sitemaps", list);
  } else if (cmd === "submit-sitemap") {
    const feed = args[1] || config.sitemapUrl || `${SITE}/sitemap.xml`;
    await api("PUT", `${WM}/sites/${enc(property)}/sitemaps/${enc(feed)}`);
    console.log(`✓ Submitted ${feed}`);
  } else console.log("Commands: sites | performance [days] | inspect [url...] [--sitemap N] | sitemaps | submit-sitemap [url]");
} catch (e) {
  console.error(`✗ Search Console error: ${redact(e.message)}`);
  if (/permission|forbidden|403|not have/i.test(e.message)) console.error("→ Add the service-account email as a user (Full) in Search Console, and check config.gscProperty with: gsc.mjs sites");
  process.exit(1);
}
