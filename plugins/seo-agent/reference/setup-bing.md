# Bing setup (Webmaster API + IndexNow)
1. https://www.bing.com/webmasters → make sure the site is verified (can import from Google Search Console).
2. Settings (gear) → **API access** → **API key** → generate/copy. This is `BING_API_KEY`.
3. IndexNow key (not secret, it becomes public): user runs `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
4. The agent may create the key file with approval: Next.js/most static hosts → `public/<KEY>.txt` with only the key as content.
   Other stacks: any file served at `https://<site>/<KEY>.txt`. The user deploys it.
5. User adds to `.env.seo`:
   ```
   BING_API_KEY=<key>
   INDEXNOW_KEY=<key from step 3>
   ```
6. Verify: `bing.mjs quota` (API) and, after deploy, `bing.mjs indexnow <homepage-url>` (expects 200 or 202).
