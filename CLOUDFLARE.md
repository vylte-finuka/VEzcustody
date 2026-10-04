# Cloudflare Pages — VEZ PoR (static)

## Build settings (Dashboard)

| Field | Value |
|-------|--------|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `exit 0` |
| Build output directory | `cloudflare-pages` |
| Root directory | *(empty)* |
| **Environment variable** | `SKIP_DEPENDENCY_INSTALL` = `true` |

`SKIP_DEPENDENCY_INSTALL=true` is required so Cloudflare does **not** run `bun install` / `npm install` (this site is 100% static HTML/CSS).

## Deploy

1. Workers & Pages → Create → Pages → Connect Git → `VEzcustody`
2. Apply settings above → **Save and Deploy**

## CLI

```bash
npx wrangler pages deploy cloudflare-pages --project-name=vez-por
```
