---
description: Full SEO + performance + indexing audit with a prioritized report
argument-hint: "[focus or URLs]"
---
Read the manual and `.seo-agent/project-notes.md`. Focus from user: $ARGUMENTS
Use the `seo-auditor` subagent for the analysis if helpful.
1. `onpage.mjs` (whole sitemap up to config.maxPages)
2. `speed.mjs --sitemap 5 --desktop`
3. `gsc.mjs performance 28` and `gsc.mjs inspect --sitemap 20`
4. `bing.mjs queries`
(If a tool exits with code 3, note the missing key and continue.)
5. Read the relevant source code (not protected files) to find root causes of the main issues.
6. Compare with the previous `seo-reports/*-audit.md` if one exists (better/worse).
7. Write `seo-reports/<YYYY-MM-DD>-audit.md`: tool status, score table, search data, issues ranked by impact × ease with
   evidence (file:line / URL), fix, and who does it (agent / user). Add "checked and fine" and "not checked" sections.
8. Reply with a short summary in the user's language: top 5 agent fixes, top 5 user tasks, next command to run.
