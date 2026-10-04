# Deploy VEZ PoR on Cloudflare Pages (free)

## Option A — Connect GitHub (recommended)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select repo `vylte-finuka/VEzcustody`, branch `main`
3. Build settings:

| Field | Value |
|-------|--------|
| Framework preset | **None** |
| Build command | *(leave empty)* or `echo static` |
| Build output directory | `cloudflare-pages` |
| Root directory | `/` |

4. **Save and Deploy**

Custom domain (optional): `por.vyft-one.com` → Cloudflare DNS CNAME to `*.pages.dev`

## Option B — Wrangler CLI

```bash
npm i -g wrangler
wrangler pages deploy cloudflare-pages --project-name=vez-por
```

## What is included

- Static HTML/CSS (Vyft design) — **no Netlify credits**
- Live PoR via browser → `https://slu-charene.vyft-one.com` (RPC)
- Monthly reports table + snapshot download

## API routes (mint / PDF)

Next.js APIs (`/api/mint`, `/api/reports`) need Node. Host them later on a Worker/Node host, or keep the static PoR on Pages only.
