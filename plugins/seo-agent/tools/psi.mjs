// PageSpeed Insights helpers shared by speed.mjs and perfcheck.mjs (no dependencies).
import { spawnSync } from "node:child_process";
import { redact } from "./lib.mjs";

export const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"];

export function summarize(lhr, strategy) {
  const scores = Object.fromEntries(Object.entries(lhr.categories || {}).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
  const metrics = Object.fromEntries(METRICS.map((id) => [id, lhr.audits?.[id]?.displayValue ?? "n/a"]));
  const num = (id) => lhr.audits?.[id]?.numericValue;
  const values = { lcpMs: num("largest-contentful-paint"), cls: num("cumulative-layout-shift"), tbtMs: num("total-blocking-time"), fcpMs: num("first-contentful-paint") };
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
  return { url: lhr.finalDisplayedUrl || lhr.finalUrl, strategy, scores, metrics, values, runtimeError: lhr.runtimeError?.message, issues };
}

export function field(le) {
  if (!le?.metrics) return { note: "No real-user (CrUX) data for this URL yet (not enough traffic)." };
  const pick = (k) => le.metrics[k] && { p75: le.metrics[k].percentile, rating: le.metrics[k].category };
  return { overall: le.overall_category, LCP_ms: pick("LARGEST_CONTENTFUL_PAINT_MS"), INP_ms: pick("INTERACTION_TO_NEXT_PAINT"), CLS_x100: pick("CUMULATIVE_LAYOUT_SHIFT_SCORE"), level: le.origin_fallback ? "origin" : "url" };
}

export async function psi(url, strategy = "mobile") {
  const key = process.env.PSI_API_KEY;
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) qs.append("category", c);
  if (key) qs.set("key", key);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(150000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.lighthouseResult) return { ...summarize(j.lighthouseResult, strategy), fieldData: field(j.loadingExperience) };
    const msg = j.error?.message || `HTTP ${res.status}`;
    if (attempt === 3 || res.status === 400) throw new Error(redact(msg) + (key ? "" : " (tip: set PSI_API_KEY for a higher quota)"));
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

// Lighthouse on this computer (needs Google Chrome installed; first run downloads lighthouse via npx).
export function lighthouseLocal(url, strategy = "mobile") {
  const a = ["-y", "lighthouse@12", url, "--output=json", "--output-path=stdout", "--quiet",
    "--only-categories=performance,accessibility,best-practices,seo", "--chrome-flags=--headless=new --no-sandbox"];
  if (strategy === "desktop") a.push("--preset=desktop");
  const r = spawnSync("npx", a, { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || "lighthouse failed (is Google Chrome installed?)").split("\n").filter(Boolean).slice(-3).join(" "));
  return summarize(JSON.parse(r.stdout), strategy);
}
