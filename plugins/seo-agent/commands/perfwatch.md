---
description: Set up automatic performance checks after every production deploy (GitHub Action + Claude investigation only when scores drop)
argument-hint: "[status]"
---
Guide the user step by step (their language, beginner-friendly, one step at a time, wait for "done"). Request: $ARGUMENTS
Read `${CLAUDE_PLUGIN_ROOT}/templates/seo-perf-check.yml` (path also derivable from the session context's plugin folder).
Track progress in `.seo-agent/state/perfwatch.json`.

1. **Config** (change protocol): in `.seo-agent/config.json` add if missing
   `"speedUrls"`: 5 key pages (homepage, main listing page, one category, the 2 product/landing pages with most impressions
   from the latest GSC data) and `"perfThresholds": { "perfDrop": 8, "lcpIncreaseMs": 500, "clsIncrease": 0.05, "seoDrop": 1, "a11yDrop": 1 }`.
   Ask whether the user wants other thresholds.
2. **Workflow file** (change protocol): create `.github/workflows/seo-perf-check.yml` from the template, replacing
   `__PLUGIN_REPO__` with the plugin's GitHub repo (`owner/claude-seo-agent`; ask if unknown). Nothing else changes.
3. **GitHub secret** (user does it): repo → Settings → Secrets and variables → Actions → New repository secret →
   `PSI_API_KEY` = their PageSpeed key. Never ask for the value.
4. **Host check**: the workflow starts on GitHub "deployment_status" events. Vercel's GitHub integration creates them
   (repo page → right side "Deployments" → Production). Netlify/others: tell the user to check the same.
   Skip builds for bot branches: Vercel → Settings → Git → Ignored Build Step →
   `if [[ "$VERCEL_GIT_COMMIT_REF" == seo-* ]]; then exit 0; else exit 1; fi`  (covers seo-report/*, seo-weekly/*, seo-perf/*).
5. **Commit + push** the two files (give the exact commands; the push to the production branch deploys and fires the workflow).
   The first run has no baseline, so it just saves one. Show where to watch: repo → Actions → "SEO perf check".
6. **Claude investigation task** (user does it on claude.ai/code/routines): New task "SEO perf regression", repository = this repo,
   same cloud environment as the night check (with `SEO_AGENT_MODE=readonly`; network must allow github.com and
   www.googleapis.com), trigger = **API only**, prompt:
   `/seo-agent:regress — Investigate the regression described in the routine-fire-payload block.`
   After Create, copy the Fire URL and the token (shown once) into two new repository secrets: `SEO_ROUTINE_URL`, `SEO_ROUTINE_TOKEN`.
   Without them the workflow still opens a plain GitHub issue with the numbers.
7. **End-to-end test**: Actions → "SEO perf check" → Run workflow → `simulate_regression` = true. Expected: the workflow reports a
   regression, the Claude task starts, and a `[TEST] ⚠️ Performance dropped…` issue appears. The user closes the test issue.
8. Finish with a short "how it works" summary and how to accept an intended drop (`accept_baseline`).
