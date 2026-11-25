---
description: Morning delivery - opens a pull request for the newest SEO report branch (used by the morning cloud task)
---
Unattended. Do not change any file. Never print secrets.
1. `git fetch origin "+refs/heads/seo-report/*:refs/remotes/origin/seo-report/*"` and list `origin/seo-report/*` branches.
2. For each report branch (newest first, at most 3): check with the available GitHub capability (GitHub tool or `gh` CLI)
   whether a pull request from it already exists (open or closed). Pick the branches that have none.
3. For each such branch: read its summary with `git checkout <branch> -- seo-reports` (then read the `<date>-summary.md` file)
   and open a pull request into the default branch titled "SEO report <date>", body = the 5-line summary + "Full report:
   seo-reports/<date>-report.md". 
4. If there is nothing new: print "No new report to deliver" and stop. If the newest report branch is older than the
   expected run (e.g. last night's run failed), open a GitHub issue titled "SEO monitoring: last night's run did not produce a report"
   only if such an issue is not already open.
