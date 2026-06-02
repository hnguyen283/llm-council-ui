# LLM Council Angular Dashboard

Simple SPA for the [llm-council](../llm-council) Spring backend. It submits
research queries, streams workflow progress over SSE, and renders the final
adjudicated report.

Some build artifacts still use the original project name
`ai-orchestrator-ui` in `angular.json` and `dist/ai-orchestrator-ui/`.
Those names are intentionally deferred so this UI work does not become a
repo-wide rename.

## Stack

- Angular 18 with standalone components, signals, and functional guards.
- Functional HTTP interceptor for bearer access tokens.
- HttpOnly refresh-token cookies issued by the backend.
- Fetch + ReadableStream for SSE because native EventSource cannot send
  Authorization headers.

## Secure Local Run

Use this path when validating login, refresh, logout, mobile resume, or any
Secure/SameSite cookie behavior.

1. Create trusted local certs as described in
   [docs/runbooks/https-local-development.md](../llm-council/docs/runbooks/https-local-development.md).
2. Put the UI cert files at:
   - `ssl/cert.pem`
   - `ssl/key.pem`
3. In `../llm-council/.env`, use:

```env
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=Strict
AUTH_COOKIE_PATH=/auth
AUTH_COOKIE_DOMAIN=
CORS_ALLOWED_ORIGINS=https://localhost:4200
```

4. Start the backend stack, then run:

```bash
npm install
npm run start:https
```

Open `https://localhost:4200`. The HTTPS dev server proxies `/auth/**` and
`/jobs/**` to the existing gateway at `http://localhost:8080`, so the browser
sees one secure origin while internal development traffic stays unchanged. The
HTTPS proxy strips the browser `Origin` header before forwarding to the gateway,
so LAN proxy mode does not require a backend restart every time the host IP
changes.

For LAN/mobile testing, include the LAN IP in the certificate and run:

```bash
npm run start:https:lan
```

Then browse to `https://<lan-ip>:4200`. Use the same host consistently in the
address bar; do not mix `localhost`, `127.0.0.1`, and LAN IP in one session
when testing `SameSite=Strict` cookies.

## HTTP Compatibility Run

Plain HTTP remains available for quick UI work that does not validate refresh
cookies:

```bash
npm start
npm run start:lan
```

When using HTTP, set `AUTH_COOKIE_SECURE=false` in the backend `.env`. Browsers
can reject `Secure` cookies over `http://`, so HTTP runs are not valid evidence
for production cookie behavior.

## Flow

1. Login at `/login`.
2. The access token is held in JavaScript memory only.
3. The refresh token and refresh family id are stored in HttpOnly,
   `Secure`, `SameSite=Strict`, `Path=/auth` cookies.
4. Reloads and 401 recovery call `/auth/refresh` with `withCredentials`.
5. The dashboard submits `POST /jobs`, streams `/jobs/{id}/stream`, and renders
   the final report.

## Layout

```text
src/app/
  app.component.ts        # router outlet
  app.config.ts           # providers
  app.routes.ts           # routes + guard
  core/
    auth.service.ts       # in-memory access token + refresh flow
    auth.interceptor.ts   # bearer token, credentials, 401 recovery
    auth.guard.ts         # protects /dashboard
    jobs.service.ts       # REST + fetch-based SSE client
  pages/
    login/
    dashboard/
```

## Production Build

```bash
npm run build
# output: dist/ai-orchestrator-ui/
```

Serve the built files behind the production TLS edge. The browser-facing
origin must be HTTPS when `AUTH_COOKIE_SECURE=true`.

For the experimental VPS release, the parent deployment flow
`D:\Project\LLMCouncil\deploy-vps.cmd` builds this UI, stages this source tree
and `dist/ai-orchestrator-ui/`, and refreshes the VPS static portal through the
backend-side `prod-lite.sh` script. Do not put `.env`, SSL private keys, or
local certificate material in this UI tree before deployment.
