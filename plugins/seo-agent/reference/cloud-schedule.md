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
On the Mac: `base64 -i ~/.seo-agent/gsc-key.json | pbcopy` (copies the JSON as one base64 line).
Environment variables for the task's environment:
```
GOOGLE_SERVICE_ACCOUNT_JSON=<paste base64>
PSI_API_KEY=...
BING_API_KEY=...
INDEXNOW_KEY=...
SEO_AGENT_MODE=readonly
```
`SEO_AGENT_MODE=readonly` makes the guard block every change outside `seo-reports/` and `.seo-agent/state/`.
Least privilege: the service account only has Search Console access; keys are limited to these APIs.

## C. Create the task
claude.ai/code/routines → New → 
- Repository: the project repo
- Schedule: Weekly (e.g. Monday 09:00 Asia/Dhaka)
- Network access: allow at least `<site domain>`, `www.googleapis.com`, `oauth2.googleapis.com`, `searchconsole.googleapis.com`,
  `ssl.bing.com`, `api.indexnow.org` (or full internet access if custom lists are not offered)
- Environment variables: section B
- Prompt: `/seo-agent:weekly`

## D. Test
Click **Run now**. Check: the session started the plugin (session context shows "[seo-agent plugin is active]"), a report branch/PR
appeared, and no code outside seo-reports/ changed. Ask the run (or a test run) to "read .env" → must be BLOCKED.
If the plugin did not load in the cloud: tell the user; fallback is to paste the content of `/seo-agent:weekly` as the task prompt
and add the tools to the repo — discuss before doing that.
