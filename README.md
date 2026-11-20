# Zenora Operations

Purchase orders, supplier pricing/shipping, packing and customer-service status for Zenora.

- Frontend: React + Vite (`src/`)
- Server: Vercel functions (`api/`) — shared data in Postgres (Supabase), Shopify via a Dev Dashboard app (client credentials).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | What |
|---|---|
| `POSTGRES_URL` | Added automatically by the Supabase integration |
| `SHOPIFY_STORE` | `houstetic.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | From the Shopify Dev Dashboard app |
| `SHOPIFY_CLIENT_SECRET` | From the Shopify Dev Dashboard app |
| `ADMIN_PIN` | Lior's login code |
| `PACKING_PIN` | Packing team's login code |
| `SERVICE_PIN` | Customer service login code |
| `SUPPLIER_KEY` | Long random text — the supplier's private link |

## Develop
`npm install` · `npm run dev` · preview build for Claude: `npm run build:preview`
