# Next.js notes (App Router and Pages Router)
- Metadata API: `metadataBase` in root layout; `generateMetadata` per dynamic route; `alternates.canonical`; `openGraph`; `robots`.
- `app/sitemap.ts|js` or route handlers for large sitemaps; `app/robots.ts|js`.
- Server Components render into HTML. Data fetched only in client components/hooks (useEffect, SWR, React Query, context)
  is NOT in the server HTML → crawlers may miss it. Fix: fetch on the server and pass as initial data.
- `notFound()` → 404. A root `loading.jsx|tsx` makes the route stream, which sends HTTP 200 before errors/notFound are known
  (404s and failures become 200 + noindex / soft errors). Prefer route-specific loading files or `<Suspense>` deeper in the tree for SEO-critical routes.
- ISR (`revalidate`): a failed revalidation keeps serving the last good page — good for outages.
- Images: `next/image` with `priority` (or `fetchPriority="high"`) on the LCP image only, correct `sizes`; avoid lazy-loading the LCP image.
- Fonts: `next/font` instead of CSS font packages to avoid render-blocking CSS and layout shift.
- Heavy client libraries (animation, sliders, lottie): `next/dynamic` and only where used; keep `"use client"` boundaries small.
- Scripts: `next/script` with `afterInteractive`/`lazyOnload`.
- `NEXT_PUBLIC_*` variables are shipped to the browser. Never treat them as secret (flag to the user, do not fix silently).
- IndexNow key file: `public/<KEY>.txt` containing only the key.
