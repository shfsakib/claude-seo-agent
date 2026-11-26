---
description: Check any web page by URL (yours or a competitor's) - Google PageSpeed scores, Core Web Vitals, and on-page SEO
argument-hint: "<url> [desktop] [local]"
---
URL and options from the user: $ARGUMENTS
Read the manual. The user giving the URL here is their permission to request it. If no URL is given, ask for it.
Before running, say in one line what will happen: "~2 page loads via Google PageSpeed (mobile + desktop) + 1 HTML fetch".
(If it is the user's own site and their project notes limit live requests, this command is the allowed exception.)

1. `node <tools>/speed.mjs <url> --desktop` → PageSpeed Insights mobile + desktop scores, lab metrics, real-user CrUX data if any.
   If the user wrote "local", use `--local` instead (Lighthouse with this computer's Chrome, no Google API).
2. `node <tools>/onpage.mjs <url> --page-only` → title, description, h1, canonical, robots/noindex, structured data, images
   without alt, Open Graph, word count, client-side-only content.
3. Reply in the user's language, compact:
   - scores table (mobile / desktop): Performance, Accessibility, Best Practices, SEO, LCP, CLS, TBT; real-user data if available
   - top problems ranked by impact (from the Lighthouse issues + SEO checks), each with a one-line fix
   - "what's already good" (2-3 lines)
   - if it's a competitor: 3 things they do better than the user's site, and 3 the user does better (only if the user's own
     latest report exists in seo-reports/; don't fetch the user's site for this)
4. Save to `seo-reports/<date>-url-<short-name>.md`. Do not change code.
