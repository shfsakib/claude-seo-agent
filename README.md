# claude-seo-agent

A Claude Code plugin marketplace with one plugin: **seo-agent**.

seo-agent audits SEO, performance and indexing; fixes code only with your approval; protects secret files with a hook;
and can run on your own schedule in the cloud (e.g. checks at 03:00, report PR at 08:00; index every 3 days, audit every 7…) even when your computer is off.

## Install (Claude Code CLI or the VS Code extension)
```
/plugin marketplace add <your-github-username>/claude-seo-agent
/plugin install seo-agent@sakib-seo-tools
```
Restart Claude Code, open your website project, then run:
```
/seo-agent:setup
```
The wizard walks you through everything step by step (security test, config, Google Search Console, PageSpeed, Bing,
IndexNow, first audit, weekly cloud run).

If `/plugin` is not available in the VS Code panel, run the two commands once in a terminal with `claude`. Plugins are
installed per user, so the VS Code extension sees them too.

## Commands
| Command | What it does |
|---|---|
| `/seo-agent:setup` | setup wizard (run again any time to continue or see status) |
| `/seo-agent:audit` | full audit → `seo-reports/<date>-audit.md` |
| `/seo-agent:fix #3 #1` | fixes, one approved change at a time |
| `/seo-agent:index` | after a deploy: sitemap resubmit, IndexNow ping, index check |
| `/seo-agent:grow` | keyword opportunities and a 4-week growth plan |
| `/seo-agent:schedule` | show/change how often each check runs (index, audit, speed, growth) and how to change the clock times |
| `/seo-agent:run` | night cloud task: runs only the due checks, saves the report to a `seo-report/<date>` branch |
| `/seo-agent:deliver` | morning cloud task: opens the pull request for the new report (you get notified) |
| `/seo-agent:weekly` | older name: run every check now |
| `/seo-agent:perfwatch` | set up a speed check after every production deploy (GitHub Action; Claude investigates only if scores drop) |
| `/seo-agent:regress` | used by that check: finds and ranks the causes of a drop and opens a GitHub issue |

## Security model
- A PreToolUse hook (`plugins/seo-agent/scripts/guard.cjs`) blocks reading/searching/printing `.env*`, keys, credentials and
  every path in your project's `.seo-agent/protected-paths.json` (Read, Grep, Glob, Bash, PowerShell).
- The agent cannot change `.seo-agent/protected-paths.json`, `.claude/settings.json` or the plugin itself.
- Every code change asks for approval. With `SEO_AGENT_MODE=readonly` (cloud runs) code changes are blocked entirely.
- Defense in depth, not a sandbox: keep real secrets out of the repo and out of the project folder when possible.

## Tools (no npm install needed, Node 18+)
`tools/onpage.mjs` crawler · `tools/speed.mjs` PageSpeed Insights / local Lighthouse · `tools/gsc.mjs` Search Console ·
`tools/bing.mjs` Bing Webmaster + IndexNow.

## Project files the plugin creates
```
.seo-agent/config.json            site URL, sitemap, Search Console property, language
.seo-agent/protected-paths.json   your private files (only you edit it)
.seo-agent/project-notes.md       what the agent learned about your project
.seo-agent/state/                 wizard progress
seo-reports/                      audits, weekly reports, history
.env.seo                          your keys (git-ignored, the agent cannot read it)
```

## Updating
Change files here, bump `version` in `plugins/seo-agent/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`,
push, then in Claude Code: `/plugin marketplace update sakib-seo-tools`.

License: MIT
