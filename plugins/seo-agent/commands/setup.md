---
description: Step-by-step setup wizard for the SEO agent (security, config, Google, Bing, first audit, weekly cloud run)
argument-hint: "[continue | status | step name]"
---
You are running the **seo-agent setup wizard**. User input: $ARGUMENTS

First read the manual (path in session context) and the reference docs `setup-google.md`, `setup-bing.md`, `cloud-schedule.md`
(and `nextjs.md` if relevant). Talk in the user's language (Banglish if they write Banglish). Assume a beginner:
**one step at a time**, explain why in one sentence, give exact commands/clicks, then WAIT for their reply before moving on.

Track progress in `.seo-agent/state/setup.json` (you may write this file freely): which steps are done, never any secret.
If it exists, show a short checklist of done/pending and continue from the first pending step.

## Phase A — Security first (nothing else before this is done)
A1. **Old manual install?** If any of these exist: `seo-tools/lib.mjs`, `.claude/hooks/protect-files.cjs`, `SEO-AGENT.md`,
    or a `CLAUDE.md` starting with "# SEO Agent — Operating Manual":
    - Read old `.claude/protected-paths.json` (allowed) and carry its "blocked" list into the new config (step A3).
    - If the old CLAUDE.md has a project-specific section, copy that knowledge into `.seo-agent/project-notes.md` (approval).
    - Keep `seo-reports/` (history). Then give the user ONE terminal command to remove the old files that they run themselves,
      for example: `rm -rf seo-tools .claude/hooks .claude/commands .claude/agents .claude/protected-paths.json SEO-AGENT.md`
      and tell them to delete the old CLAUDE.md only if it contains nothing else of theirs. Their old `.claude/settings.json`
      will be replaced in A6.
A2. Detect the stack from `package.json` / files (framework, router, build/check/lint scripts). Ask nothing you can detect.
A3. **Protected files.** Ask which files/folders the agent must never see (examples: payment, crypto/encryption, API clients
    with secrets, utils). Also look at file NAMES with Glob (not contents) for likely-sensitive names
    (crypto, secret, private, wallet, payment, token, auth, key) and suggest them. Built-in protection already covers
    `.env*`, keys and credentials. Create `.seo-agent/protected-paths.json`:
    `{ "blocked": ["**/agent.js", "src/lib/payment/**", ...] }` — this needs approval and afterwards ONLY the user can edit it;
    tell them how (Cmd+P → file name in VS Code).
A4. **Live security test** (do it, report as a table): try to Read `.env` (if it exists), run `cat .env`, Read one file from the
    protected list, Grep the folder containing it, and Edit `.seo-agent/protected-paths.json`. All must be BLOCKED.
    If anything is NOT blocked: stop, tell the user, do not continue.
A5. `.gitignore`: make sure it contains `.env.seo`, `.seo-agent/secrets/` and the stack's env files. Propose the edit (approval).
A6. `.claude/settings.json` (project): build the recommended content = deny rules mirroring the protected list
    (`"Read(./.env)"`, `"Read(./.env.*)"`, `"Read(**/agent.js)"`…), plus `extraKnownMarketplaces` and `enabledPlugins` for this
    plugin (ask the user for their GitHub username / marketplace repo; marketplace name is in the plugin README).
    If the file does not exist → create it (approval). If it exists → you cannot edit it: show the full merged JSON and ask the
    user to replace the file content and save. Validate that it is valid JSON afterwards by reading it.

## Phase B — Project config
B1. Ask for the live domain. Fetch the homepage, `/robots.txt`, the sitemap (from robots or `/sitemap.xml`). Detect www vs
    non-www (follow redirects) and a `google-site-verification` meta tag (hint: URL-prefix property).
B2. Create `.seo-agent/config.json` (approval):
    `{ "siteUrl", "sitemapUrl", "gscProperty", "framework", "replyLanguage", "maxPages": 50, "speedPages": 5,
       "maxLinkChecks": 150, "strikingMinImpressions": 20 }`
B3. Create `.seo-agent/project-notes.md` (approval) with what you learned: framework, key folders, data flow for pages,
    validation commands, things never to touch (checkout, payments…), deploy method if the user knows it.
B4. Run `onpage.mjs --sitemap 10` as a smoke test and show a 3-line result.

## Phase C — Data connections (each one separately; the user does the clicks)
C1. Google Search Console + PageSpeed key → follow `setup-google.md` step by step. Verify with `gsc.mjs sites`; fix
    `gscProperty` if needed (propose the config edit).
C2. Bing + IndexNow → follow `setup-bing.md`. Verify with `bing.mjs quota`. IndexNow test after the key file is deployed.
C3. Remind: `.env.seo` lives in the project root and only the user edits it. Never ask for the values.

## Phase D — First audit
Run `/seo-agent:audit` (or tell the user to run it) and summarize the top 5 agent fixes and top 5 user tasks.

## Phase E — Weekly cloud monitoring
Follow `cloud-schedule.md` sections A→D with the user. Give them the exact environment variable names, the base64 command,
the network allow list and the prompt `/seo-agent:weekly`. Finish with "Run now" test and confirm the report appeared.

At the end, print a final checklist (all ✅ / what's left) and how to use: audit, fix, index, grow, weekly.
