# LLM Counsil — Angular Dashboard

Simple SPA for the [llm-counsil](../llm-counsil) Spring backend. Submits a
research query, streams workflow progress over SSE, and renders the final
adjudicated report.

> Some build artefacts still reference the project's original name
> (`ai-orchestrator-ui` in `angular.json`, `dist/ai-orchestrator-ui/` as the
> output path, the `aio.token` localStorage key). They were left in place to
> avoid cascading rename work — see the deferred-rename table in the backend
> README.

## Stack

- Angular 18 (standalone components, signals, new control flow)
- No UI library — just hand-rolled CSS, dark theme
- Functional HTTP interceptor for JWT
- Functional auth guard
- Fetch + ReadableStream for SSE (native EventSource can't send Authorization headers)

## Run it

```bash
npm install
npm start
```

Opens on http://localhost:4200. Requires the backend stack to be running on `localhost:8080` (the gateway).

The Angular dev server proxies `/auth/**` and `/jobs/**` to `localhost:8080` (see `proxy.conf.json`), so there are no CORS issues during development.

For access from another device on the local network, bind the dev server to all interfaces:

```bash
npm run start:lan
```

Then browse to `http://192.168.1.7:4200` from the other device. If Windows Firewall prompts, allow Node.js on private networks; otherwise open inbound TCP port `4200`.

If you bypass the Angular proxy and call the gateway directly from a browser origin, include the exact UI origins in the backend `CORS_ALLOWED_ORIGINS` value, for example:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:4200,http://192.168.1.7:4200,http://172.22.240.1:4200,http://localhost:8080
```

## Flow

1. **Login** at `/login` — backend currently accepts any non-empty credentials. JWT is stored in `localStorage`.
2. **Dashboard** at `/dashboard`:
   - Type a research question, hit "Run research"
   - `POST /jobs` returns a `jobId`
   - Opens an SSE stream on `/jobs/{id}/stream`
   - Live timeline updates: planning → collecting → validating → analyzing → debating → judging → done
   - Final report renders with confidence badge, key findings, conflicts, and tiered source list

## Layout

```
src/app/
├── app.component.ts        # router outlet
├── app.config.ts           # providers (HTTP, router, interceptor)
├── app.routes.ts           # routes + guard
├── core/
│   ├── auth.service.ts     # signal-backed token state
│   ├── auth.interceptor.ts # adds Bearer token, redirects on 401
│   ├── auth.guard.ts       # protects /dashboard
│   └── jobs.service.ts     # REST + fetch-based SSE client
└── pages/
    ├── login/login.component.ts
    └── dashboard/dashboard.component.ts
```

## Production build

```bash
npm run build
# output: dist/ai-orchestrator-ui/
```

For prod, serve the `dist/` folder behind a reverse proxy (or directly from the gateway). Make sure the gateway's `CorsConfig.java` includes your production origin.

## Notes

- **SSE auth via fetch:** Native `EventSource` can't attach `Authorization` headers. The `JobsService.stream()` method uses `fetch` with a `ReadableStream` reader and parses `text/event-stream` manually. Cancellation via `AbortController` on unsubscribe.
- **Token storage:** Currently `localStorage`. For higher security move to httpOnly cookies and update the interceptor + SSE call.
- **Proxy vs CORS:** `proxy.conf.json` handles dev. The gateway has `CorsConfig.java` for non-dev access.
