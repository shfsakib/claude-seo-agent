#!/usr/bin/env node
/**
 * seo-agent guard (PreToolUse, all tools).
 *
 *  1. Never lets Claude read, search, print or copy protected files (.env*, keys,
 *     plus everything listed in <project>/.seo-agent/protected-paths.json).
 *  2. Never lets Claude change its own safety config or the plugin itself.
 *     (protected-paths.json and .claude/settings.json may be CREATED once, with approval.)
 *  3. Forces a human approval prompt for every file change outside seo-reports/ and
 *     .seo-agent/state/. With SEO_AGENT_MODE=readonly (cloud runs) such changes are blocked.
 *  4. Blocks printing environment variables / secret values from the shell.
 *
 * Exit 2 = block (stderr is shown to Claude). This is defense in depth, not a sandbox.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_ROOT = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, ".."));
const HOME_CLAUDE = path.join(os.homedir(), ".claude");
const READONLY = /^readonly$/i.test(process.env.SEO_AGENT_MODE || "");

const DEFAULT_BLOCKED = [
  ".env", ".env.*", "**/.env", "**/.env.*",
  "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx", "**/id_rsa*", "**/id_ed25519*",
  "**/*service-account*.json", "**/*credentials*.json", "**/.npmrc", "**/.netrc",
  ".seo-agent/secrets/**",
];
const ALLOWED_EXCEPTIONS = ["**/.env.example", "**/.env.sample", "**/.env.seo.example", "**/.env.template"];
const SELF_PROTECTED = [".seo-agent/protected-paths.json", ".claude/settings.json", ".claude/settings.local.json"];
const CREATE_ONCE = [".seo-agent/protected-paths.json", ".claude/settings.json"];
const FREE_WRITE = ["seo-reports/**", ".seo-agent/state/**"];
const WRITE_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".vercel", "coverage", ".turbo", ".cache", "seo-reports"]);

function out(obj) { process.stdout.write(JSON.stringify(obj)); process.exit(0); }
function block(msg) {
  process.stderr.write(
    `BLOCKED by seo-agent guard: ${msg}\n` +
      "This is protected. Do not try another way to reach it. Explain to the user what you need and let them decide.\n"
  );
  process.exit(2);
}
function ask(reason) {
  out({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } });
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { block("could not parse hook input (fail-closed)."); }
  try { main(input); } catch (e) { block(`guard error (fail-closed): ${e.message}`); }
});

// ---------------------------------------------------------------- helpers
function expandBraces(glob) {
  const m = glob.match(/\{([^{}]*)\}/);
  if (!m) return [glob];
  return m[1].split(",").flatMap((alt) => expandBraces(glob.replace(m[0], alt)));
}
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (glob.startsWith("**/", i)) { re += "(?:.*/)?"; i += 2; continue; }
    if (glob.startsWith("**", i)) { re += ".*"; i += 1; continue; }
    if (c === "*") { re += "[^/]*"; continue; }
    if (c === "?") { re += "[^/]"; continue; }
    re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$", "i");
}
function compile(globs) {
  return globs.flatMap(expandBraces).map((g) => ({ g, re: globToRegex(g), hasSlash: g.includes("/") }));
}
function normalizeInput(p) {
  return String(p).trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/").replace(/^~(?=\/|$)/, os.homedir());
}
function isInside(abs, dir) {
  const rel = path.relative(dir, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function main(input) {
  const tool = String(input.tool_name || "");
  const ti = input.tool_input || {};
  const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());

  // project config
  let projectBlocked = [];
  const cfgPath = path.join(projectDir, ".seo-agent", "protected-paths.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      projectBlocked = Array.isArray(cfg.blocked) ? cfg.blocked : [];
    } catch (e) {
      block(".seo-agent/protected-paths.json is invalid JSON, so nothing can be checked safely. Ask the user to fix it (fail-closed).");
    }
  }
  const BLOCKED = compile([...DEFAULT_BLOCKED, ...projectBlocked]);
  const EXCEPT = compile(ALLOWED_EXCEPTIONS);
  const SELF = compile(SELF_PROTECTED);
  const ONCE = compile(CREATE_ONCE);
  const FREE = compile(FREE_WRITE);

  const absOf = (p) => path.resolve(projectDir, normalizeInput(p));
  const relOf = (abs) => path.relative(projectDir, abs).split(path.sep).join("/");
  function test(abs, list) {
    const rel = relOf(abs);
    const outside = rel.startsWith("..");
    const base = path.posix.basename(rel);
    return list.some(({ re, hasSlash }) => {
      if (!outside && re.test(rel)) return true;
      if (!hasSlash && re.test(base)) return true;
      if (outside && hasSlash) {
        // absolute/outside paths: match the glob against any suffix of the path
        const parts = abs.split(path.sep).join("/").split("/");
        for (let i = 1; i < parts.length; i++) if (re.test(parts.slice(i).join("/"))) return true;
      }
      return false;
    });
  }
  const isBlockedFile = (abs) => test(abs, BLOCKED) && !test(abs, EXCEPT);
  // a directory is protected if a "dir/**" pattern covers its contents
  const isBlocked = (abs) => isBlockedFile(abs) || test(path.join(abs, "__seo_probe__"), BLOCKED);

  // walk a directory and return the first protected file inside it (or null)
  function protectedInside(scope, globFilter) {
    let seen = 0; let hit = null;
    const consider = (abs) => {
      if (!isBlockedFile(abs)) return;
      if (globFilter) {
        const rel = path.relative(scope, abs).split(path.sep).join("/");
        const base = path.posix.basename(rel);
        if (!globFilter.some(({ re, hasSlash }) => re.test(hasSlash ? rel : base))) return;
      }
      hit = relOf(abs);
    };
    const walk = (dir, depth) => {
      if (hit || depth > 12) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (++seen > 40000) { hit = "(scope too large to verify)"; return; }
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs, depth + 1); }
        else consider(abs);
        if (hit) return;
      }
    };
    let st = null;
    try { st = fs.statSync(scope); } catch { return null; }
    if (st.isDirectory()) { if (isBlocked(scope)) return relOf(scope); walk(scope, 0); }
    else consider(scope);
    return hit;
  }
  const isSelf = (abs) => test(abs, SELF) || isInside(abs, PLUGIN_ROOT) || isInside(abs, HOME_CLAUDE);
  const isFree = (abs) => !relOf(abs).startsWith("..") && test(abs, FREE);

  // ------------------------------------------------------------ shell tools
  if (/bash|powershell|shell|terminal/i.test(tool) || (typeof ti.command === "string" && !WRITE_TOOLS.includes(tool))) {
    const cmd = String(ti.command || ti.script || "");
    if (/(^|[\s;|&(`])(printenv|env|export\s+-p|declare\s+-x|compgen\s+-e|set)(\s*$|\s*[;|&)`>])/.test(cmd))
      block("dumping environment variables is not allowed.");
    if (/\benv:|\$env:|GetEnvironmentVariable|\[Environment\]|process\.env|os\.environ|getenv|\/proc\/[^ ]*environ/i.test(cmd))
      block("reading environment variables from the shell is not allowed.");
    if (/\$\{?[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSW|CREDENTIAL|SERVICE_ACCOUNT|PRIVATE)[A-Z0-9_]*\}?/i.test(cmd))
      block("this command references a secret variable.");
    if (/(^|[\s"'=/])\.env(\.[\w.-]+)?(?=$|[\s"';|&)>])/i.test(cmd) && !/\.env\.(example|sample|template|seo\.example)\b/i.test(cmd))
      block("this command references a .env file.");

    const rawTokens = cmd.split(/[\s;|&<>()`=,]+/).map((t) => normalizeInput(t)).filter((t) => t && !t.startsWith("-"));
    const candidates = [];
    for (const t of rawTokens) {
      for (const v of new Set([t, t.replace(/^[^:/\s]+:(?!\/)/, "")])) {   // also "HEAD:src/x.js" -> "src/x.js"
        if (!v) continue;
        const abs = absOf(v);
        let st = null;
        try { st = fs.statSync(abs); } catch {}
        if (/[./*]/.test(v) || st) candidates.push({ t: v, abs, isDir: !!(st && st.isDirectory()), exists: !!st });
      }
    }
    const cmdForWrite = cmd.replace(/\d*>&\d+/g, " ").replace(/\d*>{1,2}\s*\/dev\/null/g, " ");
    const writey = /(^|[\s;|&])(rm|mv|cp|tee|chmod|chown|ln|truncate|dd|unlink|perl|python3?|ruby|install)\b|sed\s+-i|>{1,2}|node\s+(-e|--eval|-p)\b|git\s+(checkout|restore|rm|reset|clean)\b/;
    for (const c of candidates) {
      if (isBlocked(c.abs)) block(`this command touches a protected path: ${c.t}`);
      if (isSelf(c.abs) && writey.test(cmdForWrite)) block(`the agent cannot change its own safety config or the plugin: ${c.t}`);
    }

    // Commands that READ file contents recursively / in bulk: make sure no protected file is in their scope.
    const reader = /(^|[\s;|&(`])(grep|egrep|fgrep|rg|ag|ack|cat|head|tail|less|more|awk|sed|strings|xargs|tar|zip|rsync|cp|od|xxd|hexdump|base64|sort|uniq|wc|diff|nl|tac|bat|cpio|git\s+(grep|show|diff|log|archive|blame|cat-file|stash))\b/.test(cmd)
      || (/(^|[\s;|&(])find\b/.test(cmd) && /-exec|-execdir|xargs|-fprint/.test(cmd));
    if (reader) {
      const scopes = candidates.filter((c) => c.isDir).map((c) => c.abs);
      const implicitCwd = /(^|[\s;|&(])(rg|ag|ack)\b|git\s+(grep|diff|log|show|archive|stash)\b|(^|[\s;|&(])e?grep\s+[^|;&]*-[a-zA-Z]*[rR]/.test(cmd);
      // git commands that only list names/stats (no file contents) are fine over the whole repo
      const namesOnly = /git\s+(diff|log|show)\b/.test(cmd) && /--(name-only|name-status|stat|shortstat|numstat|oneline)\b/.test(cmd)
        && !/(\s-p\b|--patch|\s-U\d|--unified|--word-diff)/.test(cmd) && !/(^|[\s;|&(])(cat|grep|rg|xargs)\b/.test(cmd);
      if (implicitCwd && !namesOnly && !candidates.some((c) => c.exists)) scopes.push(projectDir);
      for (const sc of scopes) {
        const hit = protectedInside(sc);
        if (hit) block(`this command would read inside a folder that contains protected files (${hit}). Point it at specific files or a folder without protected files${/git\s+(diff|log|show)/.test(cmd) ? ", e.g. git diff -- src/app" : ""}.`);
      }
    }
    out({});
  }

  // ------------------------------------------------------------ file tools
  const paths = [ti.file_path, ti.notebook_path, ti.path].filter((p) => typeof p === "string" && p);
  for (const p of paths) {
    const abs = absOf(p);
    if (isBlocked(abs)) block(`protected path: ${relOf(abs)}`);
  }
  for (const pat of [tool === "Glob" ? ti.pattern : null, ti.glob].filter(Boolean)) {
    if (/\.env(?!\.example|\.sample)|secret|private|credential|\.pem|\.key\b|id_rsa/i.test(pat)) block(`search pattern targets protected files: ${pat}`);
  }

  // Grep reads file CONTENTS: make sure no protected file is inside the search scope.
  if (tool === "Grep") {
    const hit = protectedInside(absOf(ti.path || "."), ti.glob ? compile([String(ti.glob)]) : null);
    if (hit) block(`this search would read protected file contents (${hit}). Narrow the Grep path to a folder without protected files, or add a glob that excludes them.`);
  }

  // ------------------------------------------------------------ writes
  if (WRITE_TOOLS.includes(tool)) {
    for (const p of paths) {
      const abs = absOf(p);
      if (isInside(abs, PLUGIN_ROOT) || isInside(abs, HOME_CLAUDE)) block("the agent cannot modify the plugin or ~/.claude.");
      if (test(abs, SELF)) {
        if (test(abs, ONCE) && !fs.existsSync(abs) && !READONLY)
          ask(`⚠️ SECURITY FILE: the agent wants to CREATE ${relOf(abs)}. After this, only you can edit it. Check the content above carefully before approving.`);
        block(`${relOf(abs)} is a safety file. Only the user may edit it (give them the exact text to paste).`);
      }
    }
    const allFree = paths.length > 0 && paths.every((p) => isFree(absOf(p)));
    if (allFree) out({});
    if (READONLY) block("read-only mode (SEO_AGENT_MODE=readonly): only seo-reports/ and .seo-agent/state/ can be written. Put proposed code changes in the report instead.");
    ask(`seo-agent wants to change ${paths.map((p) => relOf(absOf(p))).join(", ")}. Read the explanation above, then approve or deny.`);
  }

  out({});
}
