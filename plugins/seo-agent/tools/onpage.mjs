// Technical + on-page SEO crawl of sitemap URLs.
// node onpage.mjs [url ...] [--sitemap 50]
import { config, SITE, LOCAL_MODE, mapUrl, flag, get, targetUrls, pool, saveReport, tags, blocks, stripTags, meta } from "./lib.mjs";

// --page-only: check just the given URL(s) (any site), skip site-wide checks and the broken-link scan.
const PAGE_ONLY = !!flag("page-only", false);

const issues = [];
const add = (severity, url, message, fix) => issues.push({ severity, url, message, fix });
const norm = (u) => { try { const x = new URL(u); x.hash = ""; return x.href.replace(/\/$/, ""); } catch { return u; } };
const host = new URL(SITE).host;

async function siteChecks() {
  try {
    const { res, text } = await get(`${SITE}/robots.txt`);
    if (!res.ok) add("high", `${SITE}/robots.txt`, "robots.txt missing", "Create robots.txt (Next.js: app/robots.ts).");
    else {
      const groups = {}; let agents = []; let lastAgent = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, "").trim();
        const i = line.indexOf(":"); if (i < 0) continue;
        const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
        if (k === "user-agent") { if (!lastAgent) agents = []; agents.push(v.toLowerCase()); lastAgent = true; continue; }
        lastAgent = false;
        if (k === "disallow") for (const a of agents) (groups[a] ||= []).push(v);
      }
      if ((groups["*"] || []).includes("/")) add("critical", `${SITE}/robots.txt`, "robots.txt blocks the whole site (Disallow: /)");
      if (!/^sitemap:/im.test(text)) add("medium", `${SITE}/robots.txt`, "robots.txt has no Sitemap: line");
      for (const bot of ["googlebot", "bingbot", "gptbot", "oai-searchbot", "claudebot", "perplexitybot", "google-extended"])
        if ((groups[bot] || []).includes("/")) add(["googlebot", "bingbot"].includes(bot) ? "critical" : "info", `${SITE}/robots.txt`, `${bot} is blocked (intentional?)`);
    }
  } catch (e) { add("high", SITE, `robots.txt fetch failed: ${e.message}`); }
  try {
    const { res } = await get(`${SITE}/llms.txt`, { method: "HEAD" });
    if (!res.ok) add("low", `${SITE}/llms.txt`, "no llms.txt (optional AI-agent summary file)");
  } catch {}
  if (LOCAL_MODE) return;   // http->https and www checks only make sense on the live domain
  const u = new URL(SITE);
  const alt = u.host.startsWith("www.") ? u.host.slice(4) : "www." + u.host;
  for (const v of [`http://${u.host}/`, `${u.protocol}//${alt}/`]) {
    if (v.replace(/\/$/, "") === SITE) continue;
    try {
      const res = await fetch(v, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      if (![301, 308].includes(res.status)) add("high", v, `${v} does not permanently redirect (HTTP ${res.status})`, `301/308 to ${SITE}`);
    } catch {}
  }
}

const pages = [];
const linkSources = new Map();
async function checkPage(url) {
  let r;
  try { r = await get(url); } catch (e) { add("critical", url, `fetch failed: ${e.message}`); return; }
  const { res, text: html, ms } = r;
  if (res.status !== 200) { add("critical", url, `sitemap URL returns HTTP ${res.status}`, "Fix the page or remove it from the sitemap."); return; }
  const finalUrl = res.url;
  if (norm(finalUrl) !== norm(url)) add("medium", url, `redirects to ${finalUrl}`, "Use the final URL in the sitemap.");
  if (ms > 1500) add("medium", url, `slow server response (${ms} ms)`, "Caching/SSG/ISR/CDN.");
  const p = { url, ms };
  const head = (html.match(/<head\b[\s\S]*?<\/head>/i) || [html])[0];
  const clean = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");

  p.title = stripTags((blocks(head, "title")[0] || {}).inner || "");
  if (!p.title) add("critical", url, "missing <title>");
  else if (p.title.length < 30 || p.title.length > 60) add("low", url, `title length ${p.title.length} (30-60 recommended)`);
  p.description = (meta(head, "description") || "").trim();
  if (!p.description) add("high", url, "missing meta description");
  else if (p.description.length < 70 || p.description.length > 160) add("low", url, `description length ${p.description.length} (70-160 recommended)`);

  p.h1 = blocks(clean, "h1").map((b) => stripTags(b.inner)).filter(Boolean);
  if (!p.h1.length) add("high", url, "no <h1>");
  else if (p.h1.length > 1) add("low", url, `${p.h1.length} <h1> tags: ${p.h1.map((h) => `"${h.slice(0, 40)}"`).join(", ")}`);

  const robots = `${meta(head, "robots") || ""} ${meta(head, "googlebot") || ""} ${res.headers.get("x-robots-tag") || ""}`;
  if (/noindex/i.test(robots)) add("critical", url, "page is noindex but listed in the sitemap");
  const canonical = (tags(head, "link").find((a) => (a.rel || "").toLowerCase() === "canonical") || {}).href;
  if (!canonical) add("medium", url, "missing canonical");
  else if (norm(mapUrl(new URL(canonical, finalUrl).href)) !== norm(finalUrl)) add("medium", url, `canonical points elsewhere: ${canonical}`);
  const htmlTag = tags(html, "html")[0] || {};
  if (!htmlTag.lang) add("low", url, "<html> has no lang attribute");
  if (meta(head, "viewport") === undefined) add("high", url, "missing viewport meta");
  if (meta(head, "og:title") === undefined || meta(head, "og:image") === undefined) add("low", url, "Open Graph title/image incomplete");

  p.schema = [];
  for (const b of blocks(html, "script").filter((b) => (b.attrs.type || "").toLowerCase() === "application/ld+json")) {
    try {
      const j = JSON.parse(b.inner);
      for (const n of [j, ...(j["@graph"] || [])].flat()) if (n && n["@type"]) p.schema.push([].concat(n["@type"]).join("/"));
    } catch { add("high", url, "invalid JSON-LD (parse error)"); }
  }
  if (!p.schema.length) add("medium", url, "no structured data (JSON-LD)");

  const imgs = tags(clean, "img");
  const noAlt = imgs.filter((a) => !("alt" in a)).length;
  const noDims = imgs.filter((a) => !a.width && !a.height && !/position:\s*absolute/.test(a.style || "")).length;
  if (noAlt) add("medium", url, `${noAlt} image(s) without alt attribute`);
  if (noDims) add("low", url, `${noDims} image(s) without width/height (CLS risk)`);

  const body = (html.match(/<body\b[\s\S]*<\/body>/i) || [html])[0].replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  p.words = stripTags(body).split(" ").filter(Boolean).length;
  if (p.words < 50) add("high", url, `server HTML has almost no text (${p.words} words): content may be client-side only`);
  else if (p.words < 300) add("low", url, `thin content (${p.words} words)`);

  for (const a of tags(clean, "a")) {
    if (!a.href || /^(mailto:|tel:|javascript:|#)/i.test(a.href)) continue;
    try {
      const abs = new URL(mapUrl(new URL(a.href, finalUrl).href)); abs.hash = "";
      if (abs.host !== host) continue;
      if (!linkSources.has(abs.href)) linkSources.set(abs.href, url);
      if (/nofollow/i.test(a.rel || "")) add("low", url, `internal link with nofollow: ${abs.pathname}`);
    } catch {}
  }
  pages.push(p);
}

if (!PAGE_ONLY) await siteChecks();
const urls = await targetUrls(config.maxPages || 50);
console.log(PAGE_ONLY ? `Checking ${urls.length} page(s) ...` : `Checking ${urls.length} page(s) of ${SITE} ...`);
await pool(urls, 5, checkPage);

for (const key of ["title", "description"]) {
  const m = new Map();
  for (const p of pages) if (p[key]) m.set(p[key], [...(m.get(p[key]) || []), p.url]);
  for (const [v, list] of m) if (list.length > 1) add("medium", list.join(", "), `duplicate ${key} on ${list.length} pages: "${v.slice(0, 70)}"`);
}
const checked = new Set(pages.map((p) => norm(p.url)));
const toCheck = PAGE_ONLY ? [] : [...linkSources.keys()].filter((l) => !checked.has(norm(l))).slice(0, config.maxLinkChecks || 150);
await pool(toCheck, 8, async (l) => {
  try {
    let { res } = await get(l, { method: "HEAD" });
    if (res.status === 405) ({ res } = await get(l));
    if (res.status >= 400) add("high", linkSources.get(l), `broken internal link -> ${l} (HTTP ${res.status})`);
  } catch {}
});

const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
issues.sort((a, b) => order[a.severity] - order[b.severity]);
const counts = issues.reduce((m, i) => ((m[i.severity] = (m[i.severity] || 0) + 1), m), {});
console.log("Issue count:", counts);
for (const i of issues.slice(0, 25)) console.log(` [${i.severity.toUpperCase()}] ${i.message}  <- ${i.url}`);
if (issues.length > 25) console.log(` ...${issues.length - 25} more in the JSON report`);
saveReport(LOCAL_MODE ? "local-onpage" : PAGE_ONLY ? "url-onpage" : "onpage", { generatedAt: new Date().toISOString(), site: SITE, sitemapUrls: urls, counts, pages, issues });
