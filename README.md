# Higgsfield Factory

Internal production panel that turns a brief into a finished, branded video ad.

Stack: **Next.js App Router + TypeScript**, SQLite, server-only Anthropic + Higgsfield calls, **ffmpeg** compose. Designed to run as a **single Railway service** (not Vercel — ffmpeg has to live on the box).

```
Brief → /api/copy (Claude) → /api/generate (Higgsfield) → /api/compose (ffmpeg) → downloadable mp4
```

API keys never leave the server. The browser only talks to this app.

## What you get

- Production floor UI: brand / service / message / tone, model (Kling 3.0 Turbo, Seedance 2.5, Veo 3.1), style preset, aspect, duration, resolution
- Live credit-cost estimate as you change model / length / resolution
- Shared board: Queued → Generating → Done
- Generate runs the full chain and plays the finished ad
- Overlays: eyebrow, headline, tagline, CTA, corner logo, 2.5s end card

## Local setup

1. Install Node 22+ and ffmpeg (macOS: `brew install ffmpeg`; Debian/Ubuntu: `sudo apt install ffmpeg fonts-dejavu-core`).
2. Copy env and fill keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | for live copy | [console.anthropic.com](https://console.anthropic.com) |
| `HIGGSFIELD_API_KEY` | for live clips | `KEY_ID:KEY_SECRET` from [cloud.higgsfield.ai](https://cloud.higgsfield.ai) |
| `SESSION_SECRET` | recommended in prod | long random string |
| `FACTORY_ADMIN_USER` / `FACTORY_ADMIN_PASSWORD` | optional | default `factory` / `factory` |
| `DATA_DIR` | optional | SQLite + media, default `./data` |
| `FACTORY_MOCK_GENERATION=1` | optional | force placeholder clips even if keys exist |

If a key is missing, that step uses a local mock (template copy and/or an ffmpeg placeholder clip) so you can still test compose and the board.

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with `factory` / `factory`, fill a brief, hit **Generate**.

SQLite lives at `data/factory.db`. Finished ads are under `data/media/` and streamed from `/api/media/:id`.

## Railway deploy (single service)

Railway runs the Dockerfile, which installs **ffmpeg + DejaVu fonts** and starts the Next.js standalone server.

1. Push this repo to GitHub.
2. In [Railway](https://railway.app): **New project → Deploy from GitHub repo**.
3. Railway should detect `Dockerfile` / `railway.toml`. If you have to pick a builder, choose **Dockerfile**.
4. Add a volume so jobs survive restarts:
   - Mount path: `/data`
   - The image already sets `DATA_DIR=/data`
5. Set environment variables:

```
ANTHROPIC_API_KEY=sk-ant-...
HIGGSFIELD_API_KEY=keyid:secret
SESSION_SECRET=long-random-string
FACTORY_ADMIN_USER=your-user
FACTORY_ADMIN_PASSWORD=your-strong-password
DATA_DIR=/data
```

Do **not** prefix these with `NEXT_PUBLIC_`. That would ship them to the browser.

6. Generate a public domain (**Settings → Networking → Generate domain**).
7. Health check is `/api/health` (configured in `railway.toml`).
8. Open the URL, sign in, run a brief.

Generate can take several minutes (Higgsfield polling). The `/api/generate` route is allowed to run up to 10 minutes.

## API (server-side only)

All routes require the session cookie except `/api/auth/login`, `/api/auth/logout`, and `/api/health`.

| Route | Purpose |
| --- | --- |
| `POST /api/copy` | Claude writes `videoPrompt`, `eyebrow`, `headline`, `tagline`, `cta` |
| `POST /api/generate` | Higgsfield create → poll until complete → download mp4 |
| `POST /api/compose` | ffmpeg burns text + logo + end card |
| `POST /api/jobs` | enqueue a brief on the shared board |
| `GET /api/jobs` | list board rows |
| `GET /api/media/:id` | stream raw or final mp4 |

Generate on the floor calls them in that order.

## Higgsfield models

Requests go to `https://platform.higgsfield.ai` as `Authorization: Key $HIGGSFIELD_API_KEY`.

| UI model | Endpoint | Notes |
| --- | --- | --- |
| Kling 3.0 Turbo | `/kling3_0_turbo` | 5s / 10s, 720p or 1080p |
| Seedance 2.5 | `/seedance_2_5` | capped at 720p |
| Veo 3.1 | `/veo3.1` | 4 / 6 / 8s, 16:9 or 9:16 |

Credit numbers on the panel are a local estimate for planning, not live Higgsfield billing.

## Security

- Keys are read only from the environment in Route Handlers (`runtime = "nodejs"`).
- `.env.local` is gitignored. `.env.example` lists names only.
- Change the default login before sharing the Railway URL.
