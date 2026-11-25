# Weekly cloud monitoring (runs even when the computer is off)
Uses Claude Code cloud scheduled tasks (claude.ai/code/routines, or `/schedule` in the CLI). Requires a Pro/Max/Team/Enterprise plan
and the project on GitHub.

## A. Pre-flight (agent runs, user confirms)
- `git remote -v` must show a GitHub URL. Repo should be **private**.
- `git ls-files | grep -iE "(^|/)\.env"` must list only example files. If a real `.env` is tracked: STOP. The user must remove it
  from git (`git rm --cached .env`, commit, push) AND rotate every secret in it, because it is already in git history.
- `.env.seo`, `.seo-agent/secrets/` must be in `.gitignore`.
- The project `.claude/settings.json` must be committed and contain the plugin entries, so cloud sessions load the plugin:
  ```json
  "extraKnownMarketplaces": { "<marketplace-name>": { "source": { "source": "github", "repo": "<github-user>/claude-seo-agent" } } },
  "enabledPlugins": { "seo-agent@<marketplace-name>": true }
  ```
  (The agent cannot edit settings.json; give the user the exact merged file to paste.)

## B. Secrets for the cloud environment (user does this; agent never sees values)
Encode the Google key as one line (run in the project folder):
`base64 -i .seo-agent/secrets/gsc-key.json | pbcopy`   (or the path where the key file lives)
Environment variables for the cloud environment (used by both tasks):
```
GOOGLE_SERVICE_ACCOUNT_JSON=<paste base64>
PSI_API_KEY=...
BING_API_KEY=...
INDEXNOW_KEY=...
SEO_AGENT_MODE=readonly
```
`SEO_AGENT_MODE=readonly` makes the guard block every change outside `seo-reports/` and `.seo-agent/state/`.
Least privilege: the service account only has Search Console access; keys are limited to these APIs.

## C. Schedule = intervals (project) + clock times (two cloud tasks)
- **Intervals** (how many days between jobs) live in `.seo-agent/config.json` → `"schedule": {"index":3,"audit":7,"speed":15,"growth":30}`
  and `"timezone"`. Change with `/seo-agent:schedule <job> <days>` then commit + push.
- **Clock times** are the two cloud tasks (claude.ai/code/routines → New), both on the project repo, same environment (section B),
  network access allowing at least `<site domain>`, `www.googleapis.com`, `oauth2.googleapis.com`, `searchconsole.googleapis.com`,
  `ssl.bing.com`, `api.indexnow.org` (or full internet access if custom lists are not offered):
  1. **"SEO night check"** — Daily at the user's check time (e.g. 03:00 Asia/Dhaka) — prompt: `/seo-agent:run`
     Runs only the jobs that are due; on other days it ends in about a minute without a branch.
  2. **"SEO morning report"** — Daily at the user's report time (e.g. 08:00) — prompt: `/seo-agent:deliver`
     Opens the pull request for any new report branch → GitHub notifies the user.
  Keep at least 2 hours between them. Cloud tasks can start a few minutes late.
- Report branches are named `seo-report/<date>`. On Vercel/Netlify, skip builds for them (Vercel: Settings → Git → Ignored Build Step →
  `if [[ "$VERCEL_GIT_COMMIT_REF" == seo-* ]]; then exit 0; else exit 1; fi` (covers seo-report/*, seo-weekly/*, seo-perf/*)).
- Cloud runs use auto mode, but anything matching an `ask` rule still stops and waits. Remove `Bash(git commit:*)` and
  `Bash(git push:*)` from the project's `permissions.ask` BEFORE the first unattended run (the guard still blocks code changes
  in readonly mode). Schedule a few minutes past the hour (e.g. 03:07, 08:07): runs exactly on the hour can start late.

## D. Test
In each task click **Run now** (for the night check you can temporarily set the prompt to `/seo-agent:run --force all`, then
change it back). Check: the session context shows "[seo-agent plugin is active]", a `seo-report/<date>` branch appears, the
morning task opens a PR from it, and no code outside seo-reports/ changed. A "read .env" attempt must be BLOCKED.
If the plugin does not load in the cloud: tell the user; discuss a fallback before doing anything else.
