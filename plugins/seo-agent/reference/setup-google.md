# Google setup (Search Console API + PageSpeed Insights key)
Guide the user through one step at a time; wait for "done" after each.

1. Open https://console.cloud.google.com → top bar project picker → **New project** (name e.g. `seo-agent`) → Create → select it.
2. **APIs & Services → Library** → search **Google Search Console API** → Enable. Then search **PageSpeed Insights API** → Enable.
3. **APIs & Services → Credentials → Create credentials → API key** → copy it. (Optional: "Edit API key" → restrict to PageSpeed Insights API.) This is `PSI_API_KEY`.
4. **IAM & Admin → Service Accounts → Create service account** → name `seo-agent` → Create and continue → skip roles → Done.
5. Click the new service account → **Keys → Add key → Create new key → JSON** → a file downloads.
   Move it OUTSIDE the project folder, e.g. macOS: `mkdir -p ~/.seo-agent && mv ~/Downloads/<file>.json ~/.seo-agent/gsc-key.json`
6. Copy the service account email (`...@...iam.gserviceaccount.com`).
7. https://search.google.com/search-console → select the property → **Settings → Users and permissions → Add user** →
   paste the email → permission **Full** → Add.
8. User puts secrets in `.env.seo` in the project root (the agent cannot read this file):
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/Users/<name>/.seo-agent/gsc-key.json
   PSI_API_KEY=<key from step 3>
   ```
   For the cloud scheduled task they will need the JSON as base64 instead (see cloud-schedule.md).
9. Verify: run `gsc.mjs sites`. Set `gscProperty` in `.seo-agent/config.json` to the exact property string shown
   (`sc-domain:example.com` for Domain properties, `https://example.com/` for URL-prefix properties).
