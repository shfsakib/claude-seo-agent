// Performance / Lighthouse audit.
// Default: Google PageSpeed Insights API (works in the cloud, no Chrome needed; also returns real-user CrUX data).
// --local : run Lighthouse locally with Chrome via npx (needs Chrome installed).
// node speed.mjs [url ...] [--sitemap 5] [--desktop] [--local]
import { spawnSync } from "node:child_process";
import { config, flag, targetUrls, saveReport, redact } from "./lib.mjs";

const urls = await targetUrls(config.speedPages || 5);
const strategies = flag("desktop", false) ? ["mobile", "desktop"] : ["mobile"];
const LOCAL = !!flag("local", false);
const KEY = process.env.PSI_API_KEY;
const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"];

function summarize(lhr, strategy) {
  const scores = Object.fromEntries(Object.entries(lhr.categories || {}).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
  const metrics = Object.fromEntries(METRICS.map((id) => [id, lhr.audits?.[id]?.displayValue ?? "n/a"]));
  const seen = new Set(); const issues = [];
  for (const [cat, c] of Object.entries(lhr.categories || {})) for (const ref of c.auditRefs || []) {
    const a = lhr.audits[ref.id];
    if (!a || seen.has(a.id) || a.score === null || a.score >= 0.9) continue;
    if (["informative", "notApplicable", "manual"].includes(a.scoreDisplayMode)) continue;
    seen.add(a.id);
    issues.push({
      category: cat, id: a.id, title: a.title, score: a.score, weight: ref.weight, displayValue: a.displayValue,
      savingsMs: a.details?.overallSavingsMs ?? a.metricSavings?.LCP ?? 0,
      examples: (a.details?.items || []).slice(0, 4).map((it) => it.url || it.source?.url || it.node?.snippet || "").filter(Boolean).map((s) => String(s).slice(0, 160)),
    });
  }
  issues.sort((x, y) => y.savingsMs - x.savingsMs || y.weight - x.weight || x.score - y.score);
  return { url: lhr.finalDisplayedUrl || lhr.finalUrl, strategy, scores, metrics, runtimeError: lhr.runtimeError?.message, issues };
}
function field(le) {
  if (!le?.metrics) return { note: "No real-user (CrUX) data for this URL yet (not enough traffic)." };
  const pick = (k) => le.metrics[k] && { p75: le.metrics[k].percentile, rating: le.metrics[k].category };
  return { overall: le.overall_category, LCP_ms: pick("LARGEST_CONTENTFUL_PAINT_MS"), INP_ms: pick("INTERACTION_TO_NEXT_PAINT"), CLS_x100: pick("CUMULATIVE_LAYOUT_SHIFT_SCORE"), level: le.origin_fallback ? "origin" : "url" };
}
async function psi(url, strategy) {
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) qs.append("category", c);
  if (KEY) qs.set("key", KEY);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(150000) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) return { ...summarize(j.lighthouseResult, strategy), fieldData: field(j.loadingExperience) };
    const msg = j.error?.message || `HTTP ${res.status}`;
    if (attempt === 2 || res.status === 400) throw new Error(redact(msg) + (KEY ? "" : " (tip: set PSI_API_KEY for a higher quota)"));
  }
}
function local(url, strategy) {
  const a = ["-y", "lighthouse@12", url, "--output=json", "--output-path=stdout", "--quiet",
    "--only-categories=performance,accessibility,best-practices,seo", "--chrome-flags=--headless=new --no-sandbox"];
  if (strategy === "desktop") a.push("--preset=desktop");
  const r = spawnSync("npx", a, { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || "lighthouse failed").split("\n").slice(-3).join(" "));
  return summarize(JSON.parse(r.stdout), strategy);
}

const results = [];
for (const url of urls) for (const s of strategies) {
  process.stdout.write(`▶ ${s.padEnd(7)} ${url} ... `);
  try {
    const r = LOCAL ? local(url, s) : await psi(url, s);
    results.push(r);
    const sc = r.scores;
    console.log(`Perf ${sc.performance} | A11y ${sc.accessibility} | BP ${sc["best-practices"]} | SEO ${sc.seo} | LCP ${r.metrics["largest-contentful-paint"]} | CLS ${r.metrics["cumulative-layout-shift"]}`);
  } catch (e) { console.log(`FAILED (${e.message})`); results.push({ url, strategy: s, error: e.message }); }
}
const top = new Map();
for (const r of results) for (const i of r.issues || []) {
  const t = top.get(i.id) || { ...i, pages: 0, totalSavingsMs: 0 };
  t.pages++; t.totalSavingsMs += i.savingsMs || 0; top.set(i.id, t);
}
const sitewide = [...top.values()].sort((a, b) => b.pages - a.pages || b.totalSavingsMs - a.totalSavingsMs).slice(0, 20);
console.log("\nTop recurring issues:");
for (const i of sitewide.slice(0, 12)) console.log(` - [${i.category}] ${i.title} (${i.pages} page(s))`);
saveReport("speed", { generatedAt: new Date().toISOString(), engine: LOCAL ? "lighthouse-local" : "pagespeed-insights", sitewide, results });
