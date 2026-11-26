---
description: Local check - build the site on this computer, run Lighthouse + SEO crawl on localhost, compare with the last local run, and explain any drop. No requests to the live site.
argument-hint: "[quick] [no-build] [accept]"
---
Read the manual and `.seo-agent/project-notes.md`. Options from the user: $ARGUMENTS
(map: "quick" → `--quick`, "no-build" / "no build" → `--no-build`, "accept" → `--accept`).

This check uses only localhost. The local server may call the project's own backend API (as it does in development); it does
not request the live website. Say this in one line before starting, plus the expected time (build 1-3 min + about 1 min per
page per Lighthouse run; quick mode is about 3× faster).

1. Run `node <tools>/localcheck.mjs <options>` from the project root. It builds, starts the site on http://127.0.0.1:3100,
   runs Lighthouse on the pages in config `speedUrls` (mapped to localhost), crawls the local sitemap, compares with
   `.seo-agent/state/local-baseline.json`, stops the server, and prints the file paths.
   - Build failed → show the important error lines, explain in plain words, stop (offer `/seo-agent:fix` only if it's SEO-related).
   - Lighthouse could not run → usually Google Chrome is missing; tell the user. Never try to bypass a BLOCKED message.
2. Read the summary (`…-local-perf-summary.md/.json`) and the newest `seo-reports/raw/*-local-onpage*.json`.
3. **If there is a regression** (or new critical/high SEO issues compared with the previous local crawl):
   - List what changed since the baseline commit (name-only, allowed by the guard): `git log --oneline <baselineSha>..HEAD`,
     `git diff --name-status <baselineSha>..HEAD`, and uncommitted work with `git status --short` and `git diff --stat`.
   - Read the relevant diffs one file at a time (`git diff <baselineSha> -- <file>`), never protected files.
   - If unsure whether it's noise, re-run just the regressed pages: `node <tools>/perfcheck.mjs <local urls> --local --runs 3 --site http://127.0.0.1:3100`
     (only while a local server is running; otherwise say the drop may be noise and suggest `/seo-agent:check` again).
   - Rank causes by impact × confidence with evidence (commit/file:line + failing Lighthouse audit) and a concrete fix each.
4. Reply in chat (user's language), short: score table (before → now), verdict (✅ no drop / ⚠️ drop / 🆕 first baseline),
   ranked causes or top 3 improvement ideas, SEO crawl problems found. Write the same into `seo-reports/<date>-local-check.md`.
5. Do not change code. Suggest `/seo-agent:fix` for fixes. If the drop is intended, tell the user to run `/seo-agent:check accept`.

Note: local scores differ from Google's live scores (different machine and network). Compare local with local only.
