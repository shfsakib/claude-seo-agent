---
description: Scheduled monitoring run - runs only the jobs that are due (index / audit / speed / growth), saves the report to a branch. Used by the night cloud task.
argument-hint: "[--force audit,index | --force all]"
---
Unattended monitoring run. Read the manual and `.seo-agent/project-notes.md`. Do NOT modify any project file except under
`seo-reports/` and `.seo-agent/state/`. Do not ask questions; decide and note. Never print secrets. Extra: $ARGUMENTS

1. **Restore previous history** (a cloud run starts from a fresh clone, earlier reports may only exist on report branches):
   `git fetch origin "+refs/heads/seo-report/*:refs/remotes/origin/seo-report/*"` then, if any exist, take the newest
   `origin/seo-report/<date>` (by name) and run `git checkout <that-branch> -- seo-reports .seo-agent/state` (ignore errors if
   a path is missing). Use only these two paths.
2. **What is due:** `node <tools>/schedule.mjs due $ARGUMENTS` → JSON with `today` and `due`. If `due` is empty: print
   "Nothing due today" with the next due dates and STOP (no branch, no commit).
3. **Run the due jobs** (missing key → exit code 3 → record it and continue):
   - `index`: `gsc.mjs inspect --sitemap 30`, `gsc.mjs sitemaps`; compare this sitemap URL list (run `onpage.mjs --sitemap 150`
     if audit is not also due, or reuse its output) with the previous run's `sitemapUrls`; new/changed URLs → `bing.mjs indexnow <urls>`;
     if the sitemap changed → `gsc.mjs submit-sitemap`.
   - `audit`: `onpage.mjs`, `gsc.mjs performance 28`, `bing.mjs queries`.
   - `speed`: `speed.mjs --sitemap 5 --desktop`.
   - `growth`: follow the `/seo-agent:grow` steps but write the plan without asking questions.
   After each successful job: `node <tools>/schedule.mjs mark <job>`.
4. **Compare** with the previous report(s) and `seo-reports/history.md`:
   🔴 regressions (score drop ≥5, LCP/CLS worse, new critical/high issues, pages no longer indexed, sitemap errors, clicks or
   impressions down ≥20%, keywords down ≥3 positions) and 🟢 wins.
5. **Write** (language from config `replyLanguage`), using `today` from step 2 in file names:
   - `seo-reports/<today>-report.md`: jobs run, regressions, wins, top 5 actions ("agent: /seo-agent:fix …" vs "you do"),
     keyword movers, not-indexed URLs with reasons and which to "Request indexing" manually.
   - `seo-reports/<today>-summary.md`: exactly 5 short lines for the pull request description.
   - append one line to `seo-reports/history.md`: date | jobs | perf mobile | SEO | clicks 28d | impressions 28d | indexed x/y | issues c/h/m.
6. **Save to GitHub without notifying:** `git checkout -b seo-report/<today>` (add `-2`, `-3` if it exists),
   `git add seo-reports .seo-agent/state`, commit "SEO report <today>", `git push -u origin HEAD`.
   Do NOT open a pull request (the morning delivery task does that). Never push to the default branch.
