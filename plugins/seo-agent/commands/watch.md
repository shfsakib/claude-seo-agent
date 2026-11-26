---
description: Automatic check on every git push (or every N days) - builds the pushed commit locally, runs Lighthouse + SEO crawl, compares with last time, and explains any drop
argument-hint: "[status | every-push | <days> | off | wait | background | test]"
---
Read the manual and `.seo-agent/project-notes.md`. Request: $ARGUMENTS. Talk in the user's language, simply.

What it does (explain in 3 lines the first time): after `git push` to the production branch, a git hook builds the pushed commit
in a temporary copy (the user's working folder and dev server are not touched), runs Lighthouse + the SEO crawl on localhost
(no requests to the live site), compares with the last good local run. No drop → a "✅" notification. Drop → Claude explains why
in `seo-reports/<date>-push-check.md` and a notification. It runs in the background by default (push is not delayed).

Always start with `node <tools>/watch.mjs status` and show: installed?, mode, branches, last run/result, next due.

Changing settings = propose an edit of `.seo-agent/config.json` → `"pushCheck"` with the change protocol:
`{ "mode": "every-push" | "days" | "off", "everyDays": 7, "branches": ["main"], "wait": false, "quick": true, "explain": true, "port": 3101 }`
- `every-push` → mode every-push · a number N → mode "days", everyDays N · `off` → mode "off" (and offer `watch.mjs disable`)
- `wait` → "wait": true (the push waits; a drop stops the push, override with `SEO_ALLOW_DROP=1 git push`) · `background` → false
- Ask which branch deploys production if unknown (see project notes).

First-time setup, in order (one step at a time):
1. Requirements: Google Chrome installed; `claude` command available in the terminal (for explanations); a first local baseline:
   if `.seo-agent/state/local-baseline.json` is missing, suggest running `/seo-agent:check` first.
2. Add to `.gitignore` (change protocol): `.seo-agent/state/plugin-path`, `.seo-agent/state/push-check.*`, `.seo-agent/state/local-baseline.json`
   (these are per-computer and should not go to GitHub).
3. Config `pushCheck` (above), then `node <tools>/watch.mjs enable` (it writes the git pre-push hook; an existing hook is kept
   and still runs first).
4. Test without pushing: `node <tools>/watch.mjs test` (foreground, 5-10 min) and show the result.
5. Tell the user: skip once with `SEO_SKIP_CHECK=1 git push`; reports are in `seo-reports/`; turn off with `/seo-agent:watch off`.
