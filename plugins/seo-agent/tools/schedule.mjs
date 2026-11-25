// Decides which monitoring jobs are due, and records finished jobs.
// node schedule.mjs status                -> JSON: today, timezone, intervals, lastRun, due[]
// node schedule.mjs due [--force a,b]     -> same as status (force marks jobs due)
// node schedule.mjs mark <job> [<job>...] -> record today as last run for these jobs
// Intervals live in .seo-agent/config.json -> "schedule": { "index": 3, "audit": 7, "speed": 15, "growth": 30 }  (0 or "off" = disabled)
// State lives in .seo-agent/state/schedule.json (agent-writable, committed with each report).
import fs from "node:fs";
import path from "node:path";
import { PROJECT, config, args, flag, today, TZ } from "./lib.mjs";

export const DEFAULTS = { index: 3, audit: 7, speed: 15, growth: 30 };
const JOBS = Object.keys(DEFAULTS);
const intervals = { ...DEFAULTS, ...(config.schedule || {}) };
const stateFile = path.join(PROJECT, ".seo-agent", "state", "schedule.json");
let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}
state.lastRun ||= {};
const t = today();
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const cmd = args[0] || "status";
if (cmd === "mark") {
  const jobs = args.slice(1).filter((j) => JOBS.includes(j));
  if (!jobs.length) { console.error(`Usage: mark <${JOBS.join("|")}> ...`); process.exit(1); }
  for (const j of jobs) state.lastRun[j] = t;
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ marked: jobs, date: t }));
} else {
  const forced = String(flag("force", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const jobs = JOBS.map((j) => {
    const raw = intervals[j];
    const every = raw === "off" || raw === false ? 0 : Number(raw) || 0;
    const last = state.lastRun[j] || null;
    const since = last ? daysBetween(last, t) : null;
    const due = forced.includes(j) || forced.includes("all") || (every > 0 && (since === null || since >= every));
    return { job: j, everyDays: every || "off", lastRun: last, daysSince: since, due, nextDue: every > 0 && last ? new Date(Date.parse(last) + every * 864e5).toISOString().slice(0, 10) : every > 0 ? t : null };
  });
  console.log(JSON.stringify({ today: t, timezone: TZ, jobs, due: jobs.filter((j) => j.due).map((j) => j.job) }, null, 2));
}
