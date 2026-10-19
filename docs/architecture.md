# Architecture

## Services

| Service | Port | Role |
|---|---|---|
| Redirect (`apps/redirect`) | 8442 | Short links, rule engine, password unlock, `+` preview, visitor status pages |
| API (`apps/api`) | 8441 | Auth and roles, links, campaigns, analytics, imports, QR codes, admin, server-sent events |
| Worker (`apps/worker`) | — | Click stream consumer (enrichment, uniques, rollups, live events) and the link health monitor |
| Dashboard (`apps/web`) | static | Next.js static export served by Caddy at `/lk/app` |
| PostgreSQL | 5432 | Source of truth |
| Redis | 6379 | Link cache, click-cap counters, click stream, live channel, rate-limit buckets |

## Request flow for one click

1. The visitor opens `https://r2-d2.xyz/lk/abc`. Caddy terminates HTTPS and proxies to the redirect service.
2. The redirect service reads `lp:link:abc` from Redis (falling back to Postgres and caching the result for ten minutes).
3. The rule engine (`packages/core/src/rules.js`) runs the nine checks in order.
4. For human visitors on capped links, `INCR lp:cap:<id>` reserves a click atomically; if it overshoots the cap it is undone and the visitor sees "limit reached".
5. The click is appended to the `lp:clicks` stream with `XADD`, without waiting, and the visitor gets a 302.
6. The worker reads the stream through the `click-workers` consumer group, parses the user agent, looks up the country and city, classifies the source, decides uniqueness with `SET NX` on a daily key, and writes `ClickEvent` and `ClickDaily` in one transaction.
7. The worker publishes the click on `lp:live`. The API relays it to dashboards over server-sent events.

## Data flow diagram — level 0

```mermaid
flowchart LR
  U[User] -- URLs, rules --> S((0 LinkPulse))
  S -- short links, QR, reports --> U
  V[Visitor] -- click, password --> S
  S -- 302 / 410 --> V
  A[Admin] -- takedowns, blocklist --> S
  S -- platform analytics --> A
  S -- URL --> G[Safe Browsing]
  G -- verdict --> S
```

## Data flow diagram — level 1

```mermaid
flowchart TB
  U[User]; V[Visitor]; A[Admin]; G[Safe Browsing API]
  P1((1.0 Create & validate link)); P2((2.0 Redirect engine)); P3((3.0 Log & enrich clicks)); P4((4.0 Analytics & reports)); P5((5.0 Govern links))
  D1[(D1 Links & rules)]; D2[(D2 Click events)]; D3[(D3 Users & campaigns)]; D4[(D4 Blocklist)]
  U -- long URL, alias, rules --> P1
  P1 -- short link + QR --> U
  P1 <-- URL / verdict --> G
  D4 -- blocked domains --> P1
  D3 -- campaign, tags --> P1
  P1 -- new link --> D1
  V -- GET /code, password --> P2
  D1 -- link + rules --> P2
  P2 -- 302 / 410 / unlock --> V
  P2 -- click event --> P3
  P3 -- enriched click --> D2
  D2 -- clicks, rollups --> P4
  D1 -- links, campaigns --> P4
  P4 -- dashboard, alerts --> U
  A -- disable, block domain --> P5
  P5 -- status: disabled --> D1
  P5 -- new domain --> D4
```

## Data model

`packages/db/prisma/schema.prisma` is the source. The main relations:

- `User` ↔ `Workspace` through `WorkspaceMember`. Each user gets a personal workspace at sign-up.
- `Workspace` has `Folder`, `Campaign`, `Tag` and `Link`.
- `Link` is the hub: `RedirectRule[]` (targeting), `ClickEvent[]`, `ClickDaily[]` (rollups), `LinkTag[]`, `AbuseReport[]`.
- `codeLower` is unique, so aliases are case-insensitive.
- `status` is `ACTIVE | PAUSED | ARCHIVED | DISABLED`; `flagged` marks auto-protected links waiting for review. Links are never deleted.
- `ImportJob` / `ImportRow` keep every CSV row with its validation result.
- `ApiToken` stores SHA-256 hashes of personal access tokens.
- `AuditLog` records every admin action.

## Security notes

- Passwords (accounts and links) use bcrypt. Sessions are HS256 JWTs in an HTTP-only, `SameSite=Lax`, `Secure` cookie scoped to `/lk`.
- Link-unlock cookies are HMAC-signed, link-scoped and expire after 12 hours.
- SSRF: destinations are refused if the host is internal or private, and again if DNS resolves to a private address; validation requests never follow redirects.
- Every user-data query goes through `ownerScope()`, so a missing role check cannot leak another user's links.
- Rate limits are atomic Redis token buckets (a Lua script) and fail open if Redis is unavailable, so a cache outage never blocks sign-in.
