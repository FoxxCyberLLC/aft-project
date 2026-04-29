# CLAUDE.md — aft-project

Guidance for Claude Code working in this repo. Read this first; the workspace-level `CLAUDE.md` covers cross-project context.

## What This Is

**AFT (Assured File Transfer)** — a Foxx Cyber LLC product. DoD-style cross-domain transfer workflow with multi-role approvals, CAC client-cert authentication, and digital signatures on every state transition. Licensed **AGPL**, intended to ship to production. Public host: `https://aft.foxxcyber.com`.

The whole product is a single all-in-one container: nginx (TLS + CAC) → Bun app (loopback only) → PostgreSQL 17, supervised by supervisord under tini.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Runtime | Bun 1.3 | `Bun.serve()` on `127.0.0.1:3001`, loopback only |
| HTTP front door | nginx | TLS termination, optional CAC client-cert verify, injects `X-AFT-Proxy-Secret` header |
| Database | PostgreSQL 17 | `Bun.SQL` (`Bun.sql`), no ORM, parameterized queries |
| Frontend | Server-rendered HTML + small inline scripts | No React/Next; pages assembled via `lib/component-builder.ts` |
| Styles | Tailwind 4 utilities + bundled `globals.css` | No CDN; `<style>` inline allowed (CSP `unsafe-inline` for now) |
| Auth | Manual password login + CAC via nginx headers | Sessions in Postgres + in-memory map |
| Email | Custom SMTP client (`lib/smtp-client.ts`) + `lib/email-service.ts` | Optional; disabled if `SMTP_HOST` blank |

**Bun-only conventions** (do not import Node equivalents):

- `Bun.serve()` for HTTP/WebSocket — not `express`
- `Bun.SQL` (`new SQL(DATABASE_URL)`) for Postgres — not `pg`
- `Bun.file` for reads — not `fs/promises`
- `bun:test` for tests — not `jest`/`vitest`
- `bun install` / `bun run` / `bun build`
- Bun auto-loads `.env` — do not import `dotenv`

## Roles & Workflow

Eight roles, defined in `lib/database-bun.ts` (`UserRole` const):

`admin`, `requestor`, `dao`, `approver`, `cpso`, `dta`, `sme`, `media_custodian`

Standard transfer flow (status state machine, `AFTStatus` const):

```
draft → submitted → pending_dao → pending_approver → pending_cpso → approved
                                                                       ↓
                                                                 pending_dta
                                                                       ↓
                                                                 active_transfer
                                                                       ↓
                                                  pending_sme_signature / pending_sme
                                                                       ↓
                                                              pending_media_custodian
                                                                       ↓
                                                              completed → disposed
```

Side branches: `rejected`, `cancelled`. Each transition is signed (CAC where available, manual signature otherwise) and recorded in `aft_request_history`.

**Layout** — each role gets:

- Top-level dir for page templates (e.g. `requestor/`, `approver/`, `dta/`, `sme/`, `cpso/`, `media-custodian/`, `admin/`)
- `server/routes/<role>-routes.ts` — page route handler
- `server/api/<role>-api.ts` — JSON API handler

Role dispatch lives in `index.ts`. Add a new role by adding all three (page dir + route + api) and wiring the path prefix into the main `fetch` handler.

## Security Model

This app is the entire trust boundary — there is no upstream tenant isolation. Read `lib/security.ts` and the proxy-secret logic in `index.ts` before touching auth.

**STIG-derived knobs** (in `SECURITY_CONFIG`):

- 10-minute idle session timeout, 8-hour absolute max
- Passwords: 12 char min, 90-day max age, 12-entry history, 5-attempt lockout (15 min)
- Standard hardening headers + a CSP that still allows `'unsafe-inline'` for scripts/styles (TODO: migrate inline page scripts into `/lib/` and tighten CSP)

**nginx ↔ Bun trust:**

1. nginx sets `X-AFT-Proxy-Secret: $AFT_PROXY_SHARED_SECRET` on every proxied request.
2. Bun does a **timing-safe** compare in `index.ts` and 403s anything else.
3. nginx also forwards verified CAC fields as `x-client-cert-*` headers. Bun strips those headers on any request that did not come from the trusted proxy or whose `x-client-cert-verify` is not `SUCCESS`. **Never** trust those headers without the secret check.
4. `/healthz` is the only path exempt from the secret check (for Docker `HEALTHCHECK`).

If `AFT_PROXY_SHARED_SECRET` is unset, the server boots in dev mode and warns loudly. Do not deploy without it.

**CAC handling:** `lib/cac-server-auth.ts` parses cert subject for EDIPI / email / CN. `lib/cac-certificate.ts` and `lib/cac-signature.ts` handle storage and signature generation. `lib/cac-web-crypto.ts` + `public/lib/cac-web-crypto.js` are the browser-side helpers (`public/lib/` is the only path under `public/` that gets served).

## Database

Schema in `schema/001_init.sql` (335 lines). 16 tables; key ones:

- `users` + `user_roles` — multi-role per user with one `primary_role` and an `active_role` chosen at session start
- `sessions` — persisted alongside the in-memory store so restarts don't kick everyone out
- `security_audit_log` — every auth/session event
- `aft_requests` + `aft_audit_log` + `aft_request_history` — request state + immutable history
- `cac_signatures`, `cac_certificates`, `cac_trust_store`, `manual_signatures` — signature evidence
- `media_drives` — physical media inventory tracked by media custodians
- `system_settings` — DB-backed runtime config
- `notification_log` + `notification_preferences` — email queue + per-user prefs

Migrations: `schema/001_init.sql` runs on boot via `lib/database-bun.ts → waitForReady()`. Additional migration SQL in `scripts/` is also applied. Adding new tables: prefer extending `001_init.sql` until we adopt a real migration tool.

Use `getDb()` for the lazy singleton, or `await sql.begin(...)` for transactions (`TxDb` wraps a transaction handle).

## Build / Run / Test

Detected package manager: **bun** (`bun.lock` present).

```bash
bun install                  # install deps
bun run dev                  # bun --hot index.ts (port 3001)
bun run start                # bun index.ts (no hot reload)
bun run build                # bun build index.ts --outdir ./dist
bun run lint                 # biome check . (must exit 0; warnings ok)
bun run lint:fix             # biome check --write .
bun run typecheck            # tsc --noEmit (must exit 0)
bun test                     # bun:test runner (no tests yet)
bun run seed:users           # scripts/seed-users.ts

./start-server.sh            # nohup wrapper, writes server.pid + server.log
./stop-server.sh
./status-server.sh           # health + tail server.log
```

**Local with everything (recommended):**

```bash
cp .env.example .env
# fill: AFT_PROXY_SHARED_SECRET, AFT_ADMIN_BOOTSTRAP_PASSWORD, POSTGRES_PASSWORD
docker compose up -d --build
# or: docker build -t aft:latest . && docker run ...  (header in Dockerfile)
```

First boot bootstraps Postgres, runs `schema/001_init.sql`, and seeds the admin user with `must_change_password=1`.

## Project-Specific Conventions

- **No ORM** — raw SQL via `Bun.SQL`. Always parameterize.
- **Frontends are server-rendered.** Pages return HTML strings via `lib/component-builder.ts`. Inline `<script>` is acceptable today; migrating to `public/lib/*.js` is the path forward (see CSP TODO).
- **Static files**: only `public/lib/*.{js,css,map}` and `static/*` are exposed. `server/static-handler.ts` enforces a strict allow-list with traversal guards.
- **Every state transition is logged** to `aft_audit_log` AND `aft_request_history` AND signed (CAC or manual). Don't add a new transition without all three.
- **Sensitive headers** (`x-client-cert-*`) — only Bun + nginx set them. Strip them on every code path that builds a `Request` from user input. The pattern is in `index.ts → sanitizeRequest`.

## Known Gaps (Things to Improve)

These are known and tracked — fix opportunistically, but they are not blocking:

- **`noExplicitAny` rule temporarily downgraded** — `biome.json` has `noExplicitAny: "warn"` instead of `"error"`. There are 777 `any` usages in DB-touching code (most are `(await db.query(...).get()) as any` for untyped row results). A dedicated follow-up PR will replace each with proper inline row types and flip the rule back to `"error"`. **Do not add new `any`s while this exception is in place.**
- **No automated tests yet.** `bun test` runs zero tests. New modules should ship with `*.test.ts` next to them.
- **File-size discipline broken in many role pages.** Workspace rule says ≤300 lines for production, ≤500 hard limit. Worst offenders: `server/api/dta-api.ts` (~1500), `media-custodian/requests.ts` (~1100), `lib/cac-signature.ts` (~770). Refactor when touching one of these.
- **CSP `'unsafe-inline'`** — comment in `lib/security.ts` is the source of truth on the migration plan.
- **Single migration file.** No real migrations tool yet — additions go on the end of `schema/001_init.sql` and into `scripts/*.sql`.

## Useful Reference

When working on Bun APIs, the bundled types live at `node_modules/bun-types/docs/**.md` — that's the authoritative source for `Bun.serve`, `Bun.SQL`, `Bun.file`, etc.
