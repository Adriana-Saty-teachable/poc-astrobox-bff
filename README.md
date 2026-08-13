# POC - BFF Proxy for Astro-Dashboard

Minimal server to validate that `<astro-dashboard>` sends requests through the `bff` attribute.

## Setup

```bash
cd poc-bff
npm install
```

## Usage

### 1. Configure

Edit the variables at the top of `server.js`, or pass them via environment:

```bash
export ASTROBOX_API_URL="https://api.astrobox.hotmart.com"  # Real API URL
export HOTMART_TOKEN="eyJhbG..."                             # Token obtained manually
export MOCK_MODE="true"                                      # Optional: use mock responses
```

### 2. Run

```bash
npm start
```

The server starts at `http://localhost:3099`.

### 3. Test in the microfrontend

```html
<astro-dashboard
  bff="http://localhost:3099"
  dashboard-id="YOUR_DASHBOARD_ID"
  language="pt-BR"
  user-id="test-user"
/>
```

**Do not pass `token`** — the proxy injects it automatically.

### 4. Observe

In the server terminal, you will see logs for each request:

```
============================================================
📥 GET /v1/resource/dashboard/abc123
   Relevant headers:
     Authorization: (none)
     X-Client-Name: astro-dashboard
   Body: (empty)
============================================================

🔀 Forwarding to: https://api.astrobox.hotmart.com/v1/resource/dashboard/abc123
✅ Astrobox response: 200 OK
```

## Operation Modes

| Mode | Description |
|------|-------------|
| **MOCK** (`MOCK_MODE=true`) | Returns saved JSON/NDJSON responses from `./mocks/` — no token or API needed |
| **PROXY** (`MOCK_MODE=false`) | Forwards requests to the real Astrobox API — requires a valid token |

## What to validate

- [ ] Microfrontend requests are reaching the proxy (visible in logs)
- [ ] The path is correct (`/v1/resource/dashboard/{id}`, `/v1/executor/...`)
- [ ] The Astrobox response arrives and the dashboard renders
- [ ] Without `token` in the frontend, the dashboard still works (proxy injects it)

## Expected endpoints

| Method | Path | When |
|--------|------|------|
| GET | `/v1/resource/dashboard/{id}` | When loading the dashboard |
| POST | `/v1/executor/reactive/by-id` | When executing queries (visualizations) |
| POST | `/v1/executor/reactive/component` | When executing saved components |

## Next steps (post-POC)

1. Add Teachable user authentication (session middleware)
2. Inject `school_id` in the body based on the logged-in user
3. Move token to Secrets Manager
4. Deploy as a real service
