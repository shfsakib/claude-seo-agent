---
description: Fix issues from the latest audit, one approved change at a time
argument-hint: "[issue numbers, e.g. #3 #1]"
---
Read the manual and `.seo-agent/project-notes.md`, then the newest `seo-reports/*-audit.md`. Requested: $ARGUMENTS
(if empty, pick the highest impact × lowest risk items).
For anything bigger than a few lines, first explain the plan in simple words (what, why, what visitors would notice, risks,
how you will test) and wait for OK. Then follow the change protocol for EACH file change. After each fix run the project's
validation commands and report. Update the report's fix log. Skip anything touching protected files; list it as a user task.
After every 3 fixes ask whether to continue, and remind the user to commit (give the command).
