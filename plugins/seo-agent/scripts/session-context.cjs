#!/usr/bin/env node
// SessionStart hook: tells Claude where the seo-agent tools live and whether this project is set up.
const fs = require("fs");
const path = require("path");
try {
  const root = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, ".."));
  const project = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const configured = fs.existsSync(path.join(project, ".seo-agent", "config.json"));
  const tools = path.join(root, "tools");
  const lines = [
    "[seo-agent plugin is active]",
    `Manual (read before any SEO work): ${path.join(root, "reference", "manual.md")}`,
    `Reference docs folder: ${path.join(root, "reference")}`,
    `Run tools from the project root with: node "${tools}/<tool>.mjs" <args>   (tools: onpage, speed, gsc, bing, schedule, perfcheck)`,
    "Security: protected files are enforced by a hook. Never try to bypass a BLOCKED message.",
    configured
      ? "This project is configured (.seo-agent/config.json). Project notes: .seo-agent/project-notes.md"
      : "This project is NOT set up yet. If the user wants SEO work, suggest running /seo-agent:setup first.",
  ];
  if (/^readonly$/i.test(process.env.SEO_AGENT_MODE || "")) lines.push("Mode: READ-ONLY (scheduled run). Do not change project code; write only seo-reports/ and .seo-agent/state/.");
  process.stdout.write(lines.join("\n") + "\n");
} catch {
  process.stdout.write("[seo-agent plugin is active]\n");
}
