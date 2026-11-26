// Shared helpers for seo-agent tools. Zero dependencies (Node 18+).
import fs from "node:fs";
import path from "node:path";

export const args = process.argv.slice(2);
export function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
// URLs given on the command line (values of flags like --site <url> are not page URLs)
const VALUE_FLAGS = new Set(["site", "sitemap", "runs", "baseline", "out", "payload", "sha", "port", "project", "force"]);
export const urlArgs = () => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) { if (VALUE_FLAGS.has(a.slice(2))) i++; continue; }
    if (/^https?:\/\//.test(a)) out.push(a);
  }
  return out;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const UA = "Mozilla/5.0 (compatible; seo-agent/1.0; +https://github.com)";

// ---- project + config
function findProject(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".seo-agent", "config.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
export const PROJECT = findProject(flag("project", process.env.CLAUDE_PROJECT_DIR || process.cwd()));
if (!PROJECT) {
  console.error("✗ .seo-agent/config.json not found. Run /seo-agent:setup first.");
  process.exit(1);
}
export const config = JSON.parse(fs.readFileSync(path.join(PROJECT, ".seo-agent", "config.json"), "utf8"));
export const PROD = String(config.siteUrl || "").replace(/\/$/, "");
// --site <origin> runs the tools against another origin (e.g. a local build at http://127.0.0.1:3100).
// Production URLs found in sitemaps, canonicals and links are mapped to that origin.
const OVERRIDE = flag("site", null);
export const LOCAL_MODE = !!OVERRIDE;
export const SITE = OVERRIDE ? String(OVERRIDE).replace(/\/$/, "") : PROD;
export function mapUrl(u) {
  if (!OVERRIDE) return u;
  try {
    const x = new URL(u); const p = new URL(PROD);
    const bare = (h) => h.replace(/^www\./, "");
    if (bare(x.host) === bare(p.host)) return SITE + x.pathname + x.search;
  } catch {}
  return u;
}
export const TZ = config.timezone || "Asia/Dhaka";
// today's date (YYYY-MM-DD) in the project's timezone, not UTC
export function today(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ---- secrets: process env (cloud) or <project>/.env.seo (local). Values are never printed.
const envFile = path.join(PROJECT, ".env.seo");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
export function secret(name, help) {
  const v = process.env[name];
  if (!v) { console.error(`✗ ${name} is not set. ${help || ""}`); process.exit(3); }
  return v;
}
export const redact = (s) => String(s).replace(/(key|token|apikey|assertion)=[^&\s"]+/gi, "$1=***");

// ---- http
export async function get(url, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(opts.timeout || 25000), ...opts });
  const text = opts.method === "HEAD" ? "" : await res.text();
  return { res, text, ms: Date.now() - t0 };
}
export async function pool(items, n, fn) {
  const outArr = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; outArr[k] = await fn(items[k], k); }
  }));
  return outArr;
}

// ---- sitemap
export async function getSitemapUrls(max = config.maxPages || 50) {
  const queue = [mapUrl(config.sitemapUrl || `${PROD}/sitemap.xml`)];
  const seen = new Set();
  const urls = [];
  while (queue.length && urls.length < max) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { res, text } = await get(sm);
      if (!res.ok) { console.warn(`! sitemap ${sm} -> HTTP ${res.status}`); continue; }
      const locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/g)].map((m) => mapUrl(decode(m[1])));
      if (/<sitemapindex/i.test(text)) queue.push(...locs);
      else for (const l of locs) if (urls.length < max) urls.push(l);
    } catch (e) { console.warn(`! sitemap fetch failed: ${sm} (${e.message})`); }
  }
  return urls;
}
export async function targetUrls(defaultCount) {
  const u = urlArgs().map(mapUrl);
  if (u.length) return u;
  const n = Number(flag("sitemap", defaultCount));
  const list = (await getSitemapUrls(Math.max(n, 1))).slice(0, n);
  return list.length ? list : [SITE + "/"];
}

// ---- tiny HTML helpers (no DOM)
export function decode(s = "") {
  return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
export function parseAttrs(s = "") {
  const out = {};
  for (const m of s.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}
export const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) => parseAttrs(m[1]));
export const blocks = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, "gi"))].map((m) => ({ attrs: parseAttrs(m[1]), inner: m[2] }));
export const stripTags = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export function meta(html, key) {
  const t = tags(html, "meta").find((a) => (a.name || a.property || "").toLowerCase() === key.toLowerCase());
  return t ? t.content ?? "" : undefined;
}

// ---- reports
export function saveReport(name, data) {
  const dir = path.join(PROJECT, "seo-reports", "raw");
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `${today()}-${name}.json`);
  if (fs.existsSync(file)) {
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "");
    file = path.join(dir, `${today()}-${name}-${hhmm}.json`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${today()}-${name}-${hhmm}-${i}.json`);
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`\nSaved: ${path.relative(PROJECT, file)}`);
  return file;
}
