---
description: Show or change the monitoring schedule (how many days between index/audit/speed/growth checks, and the clock times)
argument-hint: "[show | <job> <days|off> | times]"
---
Read the manual. Request: $ARGUMENTS   (jobs: index, audit, speed, growth)
- Always start with `node <tools>/schedule.mjs status` and show a small table: job, every N days, last run, next due.
- `<job> <days>` or `<job> off`: propose a change to `.seo-agent/config.json` → `"schedule": { "index": 3, "audit": 7, "speed": 15,
  "growth": 30 }` (add the block if missing; also `"timezone": "Asia/Dhaka"` if missing) using the change protocol. Then remind:
  the cloud task reads the config from GitHub, so the user must commit and push (give the exact commands) before it takes effect.
- `times` (or any question about clock times): explain that clock times are set on the two cloud tasks, not in the project, and
  walk the user through it step by step: open claude.ai/code/routines → open "SEO night check" (prompt `/seo-agent:run`) → edit
  schedule → Daily at the chosen time (their timezone) → save; same for "SEO morning report" (prompt `/seo-agent:deliver`).
  The night check must finish before the report time: keep at least 2 hours between them.
- To run something immediately (locally): `/seo-agent:run --force audit` (or `--force all`).
