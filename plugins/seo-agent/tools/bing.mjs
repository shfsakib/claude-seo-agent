// Bing Webmaster API + IndexNow.
// node bing.mjs quota | submit [url...] [--sitemap N] | indexnow [url...] [--sitemap N] | queries
import { SITE, args, targetUrls, saveReport, secret, redact } from "./lib.mjs";

const cmd = args[0] || "quota";
const base = "https://ssl.bing.com/webmaster/api.svc/json";
const enc = encodeURIComponent;
async function bing(method, endpoint, body) {
  const key = secret("BING_API_KEY", "Bing Webmaster Tools > Settings > API access. See reference/setup-bing.md");
  const res = await fetch(`${base}/${endpoint}${endpoint.includes("?") ? "&" : "?"}apikey=${key}`, {
    method, headers: { "Content-Type": "application/json; charset=utf-8" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bing API HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
try {
  if (cmd === "quota") {
    const j = await bing("GET", `GetUrlSubmissionQuota?siteUrl=${enc(SITE)}`);
    console.log("✓ Bing API works. URL submission quota:", j.d);
  } else if (cmd === "submit") {
    const urls = await targetUrls(20);
    await bing("POST", "SubmitUrlBatch", { siteUrl: SITE, urlList: urls });
    console.log(`✓ Submitted ${urls.length} URL(s) to Bing.`);
  } else if (cmd === "indexnow") {
    const key = secret("INDEXNOW_KEY", "See reference/setup-bing.md (key file must be live at <site>/<key>.txt).");
    const keyLocation = `${SITE}/${key}.txt`;
    const check = await fetch(keyLocation).catch(() => null);
    if (!check || !check.ok || (await check.text()).trim() !== key) {
      console.error("✗ IndexNow key file is not live on the site (or its content does not match). Deploy public/<KEY>.txt first.");
      process.exit(1);
    }
    const urls = await targetUrls(20);
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation, urlList: urls }),
    });
    const meaning = { 200: "OK", 202: "Accepted (key validation pending)", 400: "Bad request", 403: "Key not valid", 422: "URLs do not match host", 429: "Too many requests" };
    console.log(`IndexNow -> HTTP ${res.status} ${meaning[res.status] || ""} (${urls.length} URLs)`);
  } else if (cmd === "queries") {
    const j = await bing("GET", `GetQueryStats?siteUrl=${enc(SITE)}`);
    const agg = new Map();
    for (const r of j.d || []) {
      const a = agg.get(r.Query) || { query: r.Query, clicks: 0, impressions: 0, posSum: 0, n: 0 };
      a.clicks += r.Clicks; a.impressions += r.Impressions; a.posSum += r.AvgImpressionPosition; a.n++; agg.set(r.Query, a);
    }
    const rows = [...agg.values()].map(({ posSum, n, ...r }) => ({ ...r, avgPosition: +(posSum / n).toFixed(1) })).sort((a, b) => b.impressions - a.impressions).slice(0, 50);
    console.table(rows.slice(0, 20));
    saveReport("bing-queries", { generatedAt: new Date().toISOString(), rows });
  } else console.log("Commands: quota | submit | indexnow | queries");
} catch (e) {
  console.error(`✗ ${redact(e.message)}`);
  process.exit(1);
}
