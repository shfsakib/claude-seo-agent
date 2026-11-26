// Deploy performance check: measures pages several times (median), compares with a baseline,
// and reports regressions. Used by the GitHub Action after every production deploy, and by Claude to re-measure.
// node perfcheck.mjs [url ...] [--runs 3] [--baseline file] [--out file] [--payload prefix] [--sha <commit>] [--simulate]
import fs from "node:fs";
import { config, flag, urlArgs, targetUrls, today, mapUrl } from "./lib.mjs";
import { psi, lighthouseLocal } from "./psi.mjs";

const T = { perfDrop: 8, lcpIncreaseMs: 500, clsIncrease: 0.05, seoDrop: 1, a11yDrop: 1, ...(config.perfThresholds || {}) };
const RUNS = Math.max(1, Number(flag("runs", config.perfRuns || 3)));
const LOCAL = !!flag("local", false);
const urls = (urlArgs().length ? urlArgs() : Array.isArray(config.speedUrls) && config.speedUrls.length ? config.speedUrls : await targetUrls(config.speedPages || 5)).map(mapUrl);
const keyOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
const sha = String(flag("sha", process.env.DEPLOY_SHA || process.env.GITHUB_SHA || "") || "");
const SIMULATE = !!flag("simulate", false);
const median = (xs) => { const a = xs.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };

async function measure(url) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    try { runs.push(LOCAL ? lighthouseLocal(url, "mobile") : await psi(url, "mobile")); } catch (e) { console.log(`  ! ${url} run ${i + 1}: ${e.message}`); }
  }
  if (!runs.length) return { url, error: "all runs failed" };
  const perf = median(runs.map((r) => r.scores.performance));
  const rep = runs.find((r) => r.scores.performance === perf) || runs[0];   // representative run for audits
  return {
    url, runs: runs.length,
    perf, seo: median(runs.map((r) => r.scores.seo)), a11y: median(runs.map((r) => r.scores.accessibility)), bp: median(runs.map((r) => r.scores["best-practices"])),
    lcpMs: Math.round(median(runs.map((r) => r.values.lcpMs)) ?? 0), cls: +(median(runs.map((r) => r.values.cls)) ?? 0).toFixed(3), tbtMs: Math.round(median(runs.map((r) => r.values.tbtMs)) ?? 0),
    issues: rep.issues.slice(0, 8).map(({ id, title, displayValue, savingsMs, examples }) => ({ id, title, displayValue, savingsMs, examples: examples.slice(0, 2) })),
  };
}

console.log(`Measuring ${urls.length} page(s) × ${RUNS} mobile runs (median) with ${LOCAL ? "local Lighthouse" : "PageSpeed Insights"}...`);
const pages = {};
const BATCH = LOCAL ? 1 : 2;   // one Chrome at a time locally, so runs don't slow each other down
for (let i = 0; i < urls.length; i += BATCH) {
  const batch = await Promise.all(urls.slice(i, i + BATCH).map(measure));
  for (const p of batch) {
    pages[keyOf(p.url)] = p;
    console.log(p.error ? `✗ ${p.url}: ${p.error}` : `• ${p.url}  perf ${p.perf} | seo ${p.seo} | a11y ${p.a11y} | LCP ${(p.lcpMs / 1000).toFixed(2)}s | CLS ${p.cls}`);
  }
}
const current = { sha, date: today(), measuredAt: new Date().toISOString(), engine: LOCAL ? "lighthouse-local" : "pagespeed-insights", thresholds: T, pages };

// ---- compare
let baseline = null;
const bfile = flag("baseline", null);
if (bfile && fs.existsSync(bfile)) { try { baseline = JSON.parse(fs.readFileSync(bfile, "utf8")); if (!baseline.pages) baseline = null; } catch { baseline = null; } }
const findings = [];
if (baseline) for (const [url, cur] of Object.entries(pages)) {
  const b = baseline.pages[url];
  if (!b || cur.error || b.error) continue;
  const c = SIMULATE && !findings.length ? { ...cur, perf: cur.perf - T.perfDrop - 2 } : cur;
  const f = [];
  if (b.perf - c.perf >= T.perfDrop) f.push(`Performance ${b.perf} → ${c.perf} (−${b.perf - c.perf})`);
  if (c.lcpMs - b.lcpMs >= T.lcpIncreaseMs) f.push(`LCP ${(b.lcpMs / 1000).toFixed(2)}s → ${(c.lcpMs / 1000).toFixed(2)}s`);
  if (c.cls - b.cls >= T.clsIncrease) f.push(`CLS ${b.cls} → ${c.cls}`);
  if (b.seo - c.seo >= T.seoDrop) f.push(`SEO ${b.seo} → ${c.seo}`);
  if (b.a11y - c.a11y >= T.a11yDrop) f.push(`Accessibility ${b.a11y} → ${c.a11y}`);
  if (f.length) findings.push({ url, problems: f, before: b, after: c });
}
const regression = findings.length > 0;

// ---- outputs
const out = flag("out", null);
if (out) fs.writeFileSync(out, JSON.stringify(current, null, 2));
const row = (u, b, c) => `| ${u || "/"} | ${b ? b.perf : "–"} → ${c.perf ?? "✗"} | ${b ? (b.lcpMs / 1000).toFixed(2) : "–"} → ${c.lcpMs ? (c.lcpMs / 1000).toFixed(2) : "✗"}s | ${b ? b.cls : "–"} → ${c.cls ?? "✗"} | ${b ? b.seo : "–"} → ${c.seo ?? "✗"} |`;
const table = ["| Page | Perf | LCP | CLS | SEO |", "|---|---|---|---|---|", ...Object.entries(pages).map(([u, c]) => row(u, baseline?.pages?.[u], c))].join("\n");
const md = [
  SIMULATE ? "**SIMULATED TEST** (the numbers below were altered on purpose to test the alert chain)\n" : "",
  `Deploy commit: \`${sha || "unknown"}\` (baseline commit: \`${baseline?.sha || "none"}\`, measured ${baseline?.date || "–"})`,
  `Median of ${RUNS} ${LOCAL ? "local Lighthouse" : "PageSpeed"} mobile runs per page. Thresholds: perf −${T.perfDrop}, LCP +${T.lcpIncreaseMs}ms, CLS +${T.clsIncrease}, SEO/A11y −${T.seoDrop}.`,
  "", table, "",
  regression ? "### Regressions\n" + findings.map((f) => `- **${f.url}**: ${f.problems.join("; ")}\n  Failing audits now: ${f.after.issues.slice(0, 5).map((i) => `${i.title}${i.displayValue ? ` (${i.displayValue})` : ""}`).join(" · ") || "none"}`).join("\n")
    : baseline ? "No regression beyond the thresholds." : "No baseline yet: this run becomes the first baseline.",
].join("\n");
const payload = flag("payload", null);
if (payload) {
  fs.writeFileSync(`${payload}.md`, md);
  fs.writeFileSync(`${payload}.json`, JSON.stringify({ simulated: SIMULATE, baseSha: baseline?.sha || null, newSha: sha, thresholds: T, findings, pages }, null, 1));
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `regression=${regression}\nhas_baseline=${!!baseline}\n`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## SEO perf check\n\n${md}\n`);
console.log("\n" + md);
