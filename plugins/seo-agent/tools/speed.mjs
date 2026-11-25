// Performance / Lighthouse audit.
// Default: Google PageSpeed Insights API (works in the cloud, no Chrome needed; also returns real-user CrUX data).
// --local : run Lighthouse locally with Chrome via npx (needs Chrome installed).
// node speed.mjs [url ...] [--sitemap 5] [--desktop] [--local]
import { spawnSync } from "node:child_process";
import { config, flag, targetUrls, urlArgs, saveReport } from "./lib.mjs";
import { summarize, psi } from "./psi.mjs";

// Pages: URLs on the command line > config.speedUrls > first N sitemap URLs (--sitemap N)
const urls = urlArgs().length || flag("sitemap", null) || !Array.isArray(config.speedUrls) || !config.speedUrls.length
  ? await targetUrls(config.speedPages || 5)
  : config.speedUrls;
const strategies = flag("desktop", false) ? ["mobile", "desktop"] : ["mobile"];
const LOCAL = !!flag("local", false);

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
