// Local check: build the project, start it on localhost, run Lighthouse + the SEO crawler against the LOCAL build,
// compare with the previous local run, then stop the server. Sends no requests to the live site.
// node localcheck.mjs [--quick] [--no-build] [--accept] [--port 3100]
//   --quick     1 Lighthouse run per page instead of 3 (faster, noisier)
//   --no-build  reuse the existing build
//   --accept    save this run as the new local baseline even if scores dropped
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PROJECT, config, flag, today, TZ } from "./lib.mjs";

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const L = { build: "npm run build", start: "npx next start -p {port}", port: 3100, ...(config.local || {}) };
const PORT = Number(flag("port", L.port));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const QUICK = !!flag("quick", false);
const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "");
const STAMP = `${today()}-${hhmm}`;
const stateDir = path.join(PROJECT, ".seo-agent", "state");
const rawDir = path.join(PROJECT, "seo-reports", "raw");
fs.mkdirSync(stateDir, { recursive: true }); fs.mkdirSync(rawDir, { recursive: true });
const baselineFile = path.join(stateDir, "local-baseline.json");
const outFile = path.join(rawDir, `${STAMP}-local-perf.json`);
const payload = path.join(rawDir, `${STAMP}-local-perf-summary`);
const serverLog = path.join(os.tmpdir(), `seo-agent-local-${PORT}.log`);
const git = (...a) => (spawnSync("git", a, { cwd: PROJECT, encoding: "utf8" }).stdout || "").trim();
const sha = git("rev-parse", "--short", "HEAD") || "unknown";
const dirty = git("status", "--porcelain").length > 0;
const up = async () => { try { const r = await fetch(ORIGIN + "/", { signal: AbortSignal.timeout(5000) }); return r.status > 0; } catch { return false; } };
const step = (t) => console.log(`\n=== ${t}`);

if (await up()) { console.error(`✗ Something is already running on port ${PORT}. Stop it (or use --port 3200) and try again.`); process.exit(1); }

if (!flag("no-build", false)) {
  step(`Build: ${L.build}`);
  const b = spawnSync(L.build, { cwd: PROJECT, shell: true, stdio: "inherit" });
  if (b.status !== 0) { console.error("\n✗ BUILD FAILED. Fix the build first (nothing was measured)."); process.exit(2); }
}

step(`Start local server: ${L.start.replace("{port}", PORT)}  (log: ${serverLog})`);
const logFd = fs.openSync(serverLog, "w");
const server = spawn(L.start.replace("{port}", PORT), { cwd: PROJECT, shell: true, detached: true, stdio: ["ignore", logFd, logFd] });
const stop = () => { try { process.kill(-server.pid, "SIGTERM"); } catch {} };
process.on("exit", stop); process.on("SIGINT", () => { stop(); process.exit(130); });

let ready = false;
for (let i = 0; i < 120 && !ready; i++) { await new Promise((r) => setTimeout(r, 1000)); ready = await up(); }
if (!ready) { console.error(`✗ Local server did not start within 120s. See ${serverLog}`); stop(); process.exit(3); }
console.log(`✓ Running at ${ORIGIN}`);

// warm-up so the first measured run is not a cold start
for (const u of (config.speedUrls || [config.siteUrl])) {
  try { const p = new URL(u); await fetch(ORIGIN + p.pathname + p.search, { signal: AbortSignal.timeout(30000) }); } catch {}
}

step(`Lighthouse (local Chrome), ${QUICK ? 1 : 3} run(s) per page`);
const perf = spawnSync(process.execPath, [path.join(TOOLS, "perfcheck.mjs"), "--local", "--site", ORIGIN, "--runs", QUICK ? "1" : "3",
  "--baseline", baselineFile, "--out", outFile, "--payload", payload, "--sha", sha + (dirty ? "+uncommitted" : "")], { cwd: PROJECT, stdio: "inherit" });

step("SEO crawl of the local build");
spawnSync(process.execPath, [path.join(TOOLS, "onpage.mjs"), "--site", ORIGIN], { cwd: PROJECT, stdio: "inherit" });

stop();

let regression = false; let measured = false;
try { const pj = JSON.parse(fs.readFileSync(payload + ".json", "utf8")); regression = pj.findings.length > 0; measured = Object.values(pj.pages).some((p) => !p.error); } catch {}
let baselineUpdated = false;
if (perf.status === 0 && measured && (!regression || flag("accept", false))) { fs.copyFileSync(outFile, baselineFile); baselineUpdated = true; }

step("Result");
console.log(JSON.stringify({
  commit: sha, uncommittedChanges: dirty, regression, baselineUpdated,
  previousBaseline: "see the summary file for the baseline commit",
  files: { perf: path.relative(PROJECT, outFile), summary: path.relative(PROJECT, payload + ".md"), details: path.relative(PROJECT, payload + ".json"), crawl: "newest seo-reports/raw/*-local-onpage*.json" },
}, null, 2));
if (!measured) console.log("✗ Lighthouse could not measure any page. Is Google Chrome installed? See the messages above.");
