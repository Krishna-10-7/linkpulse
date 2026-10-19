# API reference

Base path: `/lk/api`. Requests and responses are JSON. Authenticate with the session cookie (dashboard) or `Authorization: Bearer lp_…` (personal access token). Errors look like:

```json
{ "error": { "code": "bad_request", "message": "This link cannot be published yet.", "errors": [{ "field": "alias", "code": "taken", "message": "…" }], "suggestions": ["diwali-26"] } }
```

## Auth

| Method | Path | |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` → creates the user and a workspace, sets the session |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| GET | `/auth/me` | current user |

## Links

| Method | Path | |
|---|---|---|
| POST | `/links/validate` | dry run: `{ ok, url, title, errors[], warnings[], suggestions[] }` |
| GET | `/aliases/:alias` | `{ available, errors[], suggestions[] }` |
| POST | `/links` | create. Body: `destination`, `alias?`, `title?`, `campaignId?` or `campaignName?`, `tags[]?`, `startsAt?`, `expiresAt?`, `clickLimit?`, `password?`, `utm{}?`, `rules[]?` (`{ type: device \| os \| country, value, destination, priority? }`) |
| GET | `/links` | `q`, `status`, `campaignId`, `tag`, `page`, `pageSize` |
| GET | `/links/:id` | |
| PATCH | `/links/:id` | any create field, plus `status` (`ACTIVE`, `PAUSED`, `ARCHIVED`) and `removePassword` |
| DELETE | `/links/:id` | archives the link; it is never hard-deleted |
| GET | `/links/:id/analytics` | `period=24h\|7d\|30d\|90d` or `from`/`to` |
| GET | `/links/:id/qr.svg`, `/links/:id/qr.png` | `fg`, `bg` (hex), `size`, `margin`, `download=1` |

## Campaigns, tags, folders

| Method | Path | |
|---|---|---|
| GET / POST | `/campaigns` | list with period stats / create `{ name, description?, startsAt?, endsAt?, goalClicks? }` |
| GET / PATCH | `/campaigns/:id` | detail with series and links / update |
| GET | `/tags` | |
| GET / POST | `/folders` | |

## Dashboard and live events

| Method | Path | |
|---|---|---|
| GET | `/dashboard` | `period`, `campaignId`, `scope=platform` (admins): KPIs, series, sources, devices, browsers, countries, campaigns, top links, alerts |
| GET | `/stream` | server-sent events: `hello`, then one `click` event per processed click |

## Bulk import

| Method | Path | |
|---|---|---|
| GET | `/imports/template.csv` | |
| POST | `/imports/preview` | `{ csv, filename }` → summary and per-row status |
| POST | `/imports` | starts a background job (202) |
| GET | `/imports`, `/imports/:id` | job progress and rows |
| GET | `/imports/:id/errors.csv` | rows that were not imported, with reasons |

## Tokens

| Method | Path | |
|---|---|---|
| GET / POST | `/tokens` | create returns the plain token once |
| DELETE | `/tokens/:id` | revoke |

## Public

| Method | Path | |
|---|---|---|
| POST | `/report` | `{ code, reason: phishing \| malware \| spam \| other }`, JSON or form post |
| GET | `/health` | database and Redis status |

## Admin (admin role)

| Method | Path | |
|---|---|---|
| GET | `/admin/stats` | platform totals |
| GET | `/admin/links` | search every link (`q`, `status`, `flagged`) |
| POST | `/admin/links/:id/disable` | `{ reason }` — stops redirects immediately |
| POST | `/admin/links/:id/restore` | |
| GET / POST | `/admin/blocklist` | add `{ domain, reason? }` pauses matching active links |
| DELETE | `/admin/blocklist/:id` | |
| GET | `/admin/reports` | open reports grouped by link |
| POST | `/admin/reports/dismiss` | `{ linkId }` |
| GET / PATCH | `/admin/users`, `/admin/users/:id` | change role |
| GET | `/admin/audit` | last 100 admin actions |

## Short links (redirect service)

| Method | Path | |
|---|---|---|
| GET / HEAD | `/lk/:code` | the nine-step rule engine, then 302 |
| GET | `/lk/:code+` | safe preview |
| POST | `/lk/:code/unlock` | form field `password` |
