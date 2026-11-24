---
description: After a deploy - push new/changed pages to Google and Bing and verify indexing
argument-hint: "[URLs] (default: sitemap)"
---
Read the manual. URLs: $ARGUMENTS
1. Ask the user to confirm the latest changes are deployed (unless already said).
2. `gsc.mjs submit-sitemap`
3. `bing.mjs indexnow $ARGUMENTS` (uses the sitemap if no URLs)
4. `gsc.mjs inspect $ARGUMENTS`
5. List not-indexed URLs with the reason and the fix. Tell the user exactly which URLs to "Request indexing" for in the
   Search Console UI (URL Inspection → Request indexing), max ~10 per day.
