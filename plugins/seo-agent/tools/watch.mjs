// Push check: after `git push` to the production branch, build the pushed commit in a temporary copy, run Lighthouse +
// SEO crawl on localhost, compare with the last good local run, and (only if scores dropped) ask Claude why.
// Config (.seo-agent/config.json):
//   "pushCheck": { "mode": "every-push" | "days" | "off", "everyDays": 7, "branches": ["main"],
//                  "wait": false, "quick": true, "explain": true, "port": 3101 }
// node watch.mjs enable | disable | status | test        (test = run now on HEAD, in the foreground)
// (internal) node watch.mjs hook <remote> <url>  /  node watch.mjs run --sha <sha>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PROJECT, config, args, flag, today } from "./lib.mjs";

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const PC = { mode: "every-push", everyDays: 7, branches: ["main"], wait: false, quick: true, explain: true, port: 3101, ...(config.pushCheck || {}) };
const STATE_DIR = path.join(PROJECT, ".seo-agent", "state");
const STATE = path.join(STATE_DIR, "push-check.json");
const LOCK = path.join(STATE_DIR, "push-check.lock");
const MARK = "# seo-agent push check";
fs.mkdirSync(STATE_DIR, { recursive: true });

const sh = (cmd, a, opts = {}) => spawnSync(cmd, a, { cwd: PROJECT, encoding: "utf8", ...opts });
const git = (...a) => (sh("git", a).stdout || "").trim();
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } };
const writeState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

function hooksDir() {
  const custom = git("config", "core.hooksPath");
  if (custom) return path.resolve(PROJECT, custom);
  return path.resolve(PROJECT, git("rev-parse", "--git-common-dir") || ".git", "hooks");
}
function notify(title, msg) {
  const clean = (t) => String(t).replace(/["\\]/g, "'").slice(0, 220);
  if (process.platform === "darwin") sh("osascript", ["-e", `display notification "${clean(msg)}" with title "${clean(title)}"`]);
  else if (process.platform === "linux") sh("notify-send", [clean(title), clean(msg)]);
}
function rememberToolsPath() { try { fs.writeFileSync(path.join(STATE_DIR, "plugin-path"), TOOLS); } catch {} }

const HOOK = `#!/bin/sh
${MARK} (installed by /seo-agent:watch). Turn off with: /seo-agent:watch off
# Skip once: SEO_SKIP_CHECK=1 git push      Push despite a drop (wait mode): SEO_ALLOW_DROP=1 git push
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -x "$HOOK_DIR/pre-push.local" ]; then "$HOOK_DIR/pre-push.local" "$@" || exit $?; fi
[ "$SEO_SKIP_CHECK" = "1" ] && exit 0
ROOT="$(git rev-parse --show-toplevel)"
T="$(cat "$ROOT/.seo-agent/state/plugin-path" 2>/dev/null)"
if [ ! -f "$T/watch.mjs" ]; then T="$(ls -td "$HOME"/.claude/plugins/cache/*/seo-agent/*/tools 2>/dev/null | head -1)"; fi
if [ ! -f "$T/watch.mjs" ]; then echo "seo-agent: tools not found, SEO push check skipped (open Claude Code once to refresh)."; exit 0; fi
exec node "$T/watch.mjs" hook --project "$ROOT" "$@"
`;

// ---------------------------------------------------------------- the actual check
function runCheck(sha) {
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, "utf8")) || 0;
    let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
    if (alive) { console.log("seo-agent: another push check is still running, skipping this one."); return null; }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const short = sha.slice(0, 7);
  const wt = path.join(os.tmpdir(), `seo-agent-check-${short}`);
  const resultFile = path.join(os.tmpdir(), `seo-agent-result-${short}.json`);
  const started = Date.now();
  let result = null;
  try {
    sh("git", ["worktree", "remove", "--force", wt]); sh("git", ["worktree", "prune"]);
    const add = sh("git", ["worktree", "add", "--detach", wt, sha]);
    if (add.status !== 0) throw new Error(`could not create a temporary copy of ${short}: ${add.stderr}`);
    // env files that are not in git (the build needs them; the agent never sees them)
    for (const f of fs.readdirSync(PROJECT)) if (/^\.env/.test(f) && !fs.existsSync(path.join(wt, f))) fs.copyFileSync(path.join(PROJECT, f), path.join(wt, f));
    const install = (config.local && config.local.install) || (fs.existsSync(path.join(wt, "package-lock.json")) ? "npm ci --prefer-offline --no-audit --no-fund" : "npm install --no-audit --no-fund");
    console.log(`\n=== Install dependencies in the temporary copy: ${install}`);
    if (spawnSync(install, { cwd: wt, shell: true, stdio: "inherit" }).status !== 0) throw new Error("dependency install failed in the temporary copy");
    const a = [path.join(TOOLS, "localcheck.mjs"), "--build-dir", wt, "--port", String(PC.port), "--sha", short, "--result", resultFile];
    if (PC.quick) a.push("--quick");
    spawnSync(process.execPath, a, { cwd: PROJECT, stdio: "inherit" });
    result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
  } catch (e) {
    result = { error: e.message };
  } finally {
    sh("git", ["worktree", "remove", "--force", wt]); sh("git", ["worktree", "prune"]);
    try { fs.unlinkSync(LOCK); } catch {}
  }
  const minutes = Math.round((Date.now() - started) / 60000);
  const st = readState();
  st.lastRun = today(); st.lastSha = short; st.lastResult = result.error ? "error" : result.regression ? "drop" : "ok"; st.minutes = minutes;
  writeState(st);

  if (result.error) { notify("SEO push check failed", result.error); console.log(`✗ ${result.error}`); return result; }
  if (!result.measured) { notify("SEO push check", "Could not measure (build failed or Chrome missing). See the log."); return result; }
  if (!result.regression) { notify("SEO push check ✅", `No drop for ${short} (${minutes} min).`); return result; }

  let explanation = "";
  if (PC.explain) {
    console.log("\n=== Scores dropped: asking Claude to find out why");
    const rel = path.relative(PROJECT, result.summaryJson);
    const c = sh("claude", ["-p", `/seo-agent:explain ${rel}`,
      "--allowedTools", "Read", "Glob", "Grep", "Write", "Bash(git log:*)", "Bash(git diff:*)", "Bash(git show:*)", "Bash(git status:*)"],
      { timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    explanation = c.error ? `(Claude could not run: ${c.error.message}. Open the summary and run /seo-agent:check in Claude Code.)` : (c.stdout || "").trim();
    console.log(explanation);
  }
  const first = explanation.split("\n").find((l) => l.trim()) || "Open the report in seo-reports/.";
  notify("⚠️ SEO: scores dropped after push", `${short}: ${first}`);
  return { ...result, explanation };
}

// ---------------------------------------------------------------- commands
const cmd = args[0] || "status";
if (cmd === "enable") {
  const dir = hooksDir(); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "pre-push");
  if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(MARK)) {
    if (fs.existsSync(path.join(dir, "pre-push.local"))) { console.error(`✗ ${file} exists and pre-push.local too. Merge them by hand first.`); process.exit(1); }
    fs.renameSync(file, path.join(dir, "pre-push.local"));
    console.log("Existing pre-push hook kept as pre-push.local (it still runs first).");
  }
  fs.writeFileSync(file, HOOK, { mode: 0o755 }); fs.chmodSync(file, 0o755);
  rememberToolsPath();
  console.log(`✓ Push check installed: ${path.relative(PROJECT, file) || file}`);
  console.log(`Mode: ${PC.mode}${PC.mode === "days" ? ` (every ${PC.everyDays} days)` : ""}, branches: ${PC.branches.join(", ")}, ${PC.wait ? "waits and stops the push on a drop" : "runs in the background"}.`);
} else if (cmd === "disable") {
  const dir = hooksDir(); const file = path.join(dir, "pre-push");
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(MARK)) {
    fs.unlinkSync(file);
    if (fs.existsSync(path.join(dir, "pre-push.local"))) fs.renameSync(path.join(dir, "pre-push.local"), file);
    console.log("✓ Push check removed.");
  } else console.log("Push check was not installed.");
} else if (cmd === "status") {
  const file = path.join(hooksDir(), "pre-push");
  const installed = fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(MARK);
  const st = readState();
  const next = PC.mode === "days" && st.lastRun ? new Date(Date.parse(st.lastRun) + PC.everyDays * 864e5).toISOString().slice(0, 10) : PC.mode === "every-push" ? "next push" : "–";
  console.log(JSON.stringify({ installed, ...PC, lastRun: st.lastRun || null, lastResult: st.lastResult || null, lastSha: st.lastSha || null, nextDue: next }, null, 2));
} else if (cmd === "test") {
  rememberToolsPath();
  const r = runCheck(git("rev-parse", "HEAD"));
  console.log("\nResult:", JSON.stringify(r, null, 2));
} else if (cmd === "run") {
  runCheck(String(flag("sha", "") || git("rev-parse", "HEAD")));
} else if (cmd === "hook") {
  // git gives "<local ref> <local sha> <remote ref> <remote sha>" lines on stdin
  const input = fs.readFileSync(0, "utf8");
  if (PC.mode === "off") process.exit(0);
  const pushed = input.split("\n").map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 4 && !/^0+$/.test(p[1]))
    .filter((p) => PC.branches.includes(p[2].replace(/^refs\/heads\//, "")));
  if (!pushed.length) process.exit(0);
  const sha = pushed[0][1];
  if (PC.mode === "days") {
    const st = readState();
    if (st.lastRun && daysBetween(st.lastRun, today()) < PC.everyDays) {
      console.log(`seo-agent: SEO check skipped (runs every ${PC.everyDays} days, last ${st.lastRun}).`);
      process.exit(0);
    }
  }
  rememberToolsPath();
  if (PC.wait) {
    console.log("seo-agent: checking performance + SEO of this push before it goes out (a few minutes)...");
    const r = runCheck(sha);
    if (r && r.regression && process.env.SEO_ALLOW_DROP !== "1") {
      console.error("\n✗ Push stopped: scores dropped (see above). Fix it, accept it with /seo-agent:check accept, or push anyway with: SEO_ALLOW_DROP=1 git push");
      process.exit(1);
    }
    process.exit(0);
  }
  const log = path.join(PROJECT, "seo-reports", "raw", `${today()}-push-check-${sha.slice(0, 7)}.log`);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, "w");
  spawn(process.execPath, [path.join(TOOLS, "watch.mjs"), "run", "--project", PROJECT, "--sha", sha], { cwd: PROJECT, detached: true, stdio: ["ignore", fd, fd] }).unref();
  console.log(`seo-agent: SEO + speed check started in the background for ${sha.slice(0, 7)} (about 5-10 min). You'll get a notification. Log: ${path.relative(PROJECT, log)}`);
  process.exit(0);
} else {
  console.log("Usage: node watch.mjs enable | disable | status | test");
}
