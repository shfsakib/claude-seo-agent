---
description: Weekly monitoring run (designed for cloud scheduled tasks; never changes project code)
---
This is an unattended monitoring run. Read the manual and `.seo-agent/project-notes.md`.
Do NOT modify any project file except under `seo-reports/` and `.seo-agent/state/`. Do not ask questions; decide and note.

1. Run: `onpage.mjs`, `speed.mjs --sitemap 5`, `gsc.mjs performance 28`, `gsc.mjs inspect --sitemap 20`, `gsc.mjs sitemaps`,
   `bing.mjs queries`. Missing keys (exit 3) → record and continue.
2. New URLs: compare this run's sitemap URL list (raw onpage JSON `sitemapUrls`) with the previous run's. For new or changed
   URLs run `bing.mjs indexnow <urls>`; if the sitemap changed, run `gsc.mjs submit-sitemap`.
3. Compare with the previous weekly/audit report and `seo-reports/history.md`:
   - 🔴 Regressions: score drop ≥5, LCP/CLS worse, new critical/high issues, pages that became not indexed, sitemap errors,
     clicks or impressions down ≥20%, keywords that dropped ≥3 positions.
   - 🟢 Wins: the opposite.
4. Write `seo-reports/<YYYY-MM-DD>-weekly.md` (short, user's language from config): summary in 5 lines, regressions, wins,
   top 5 actions (mark "agent fix with /seo-agent:fix" vs "you do"), keyword movers table.
   Append one line to `seo-reports/history.md`: date | avg perf mobile | SEO | clicks 28d | impressions 28d | indexed x/y | issues c/h/m.
5. Save the results: commit ONLY `seo-reports/` and `.seo-agent/state/` to a new branch `seo-weekly/<YYYY-MM-DD>`, push it,
   and open a pull request titled "SEO weekly report <date>" with the 5-line summary as description if possible.
   Never push to the default branch. Never include secrets in reports.
