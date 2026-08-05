# Installing Cảm Âm Tiêu Dao

This directory is the install package. Everything needed to run the service is here.

## Requirements

- Linux host with **Docker** and the **docker compose plugin**
- A **Google OAuth 2.0 Client ID** (Web application) - console.cloud.google.com → APIs &
  Services → Credentials
- An **API key** for the model that reads the sheets
- One free port. The default is **4249**, published on loopback.

No database. The service holds no state on disk.

## Install

```bash
./install.sh          # first run copies .env.example to .env and stops
$EDITOR .env          # fill in the four required values
./install.sh          # builds the image and starts the service
```

Re-running `install.sh` is also how a configuration change or a new build is applied - it is
idempotent, and it never overwrites settings you have already made.

### The four values you must set

| Variable | What |
|---|---|
| `AUTH_URL` | The public origin, scheme included, no trailing slash |
| `AUTH_GOOGLE_ID` | OAuth client ID |
| `AUTH_GOOGLE_SECRET` | OAuth client secret |
| `LLM_API_KEY` | API key for the model |

`AUTH_SECRET` is generated for you if left blank. Changing it later signs everyone out.

In the Google console, the **Authorized redirect URI** must be exactly:

```
${AUTH_URL}/api/auth/callback/google
```

A mismatch here is the single most common cause of `redirect_uri_mismatch`, and the error does
not tell you which side is wrong.

**Set `AUTH_ALLOWED_EMAILS`** unless the deployment is deliberately open. Left empty, any
Google account on the internet can sign in, and every sign-in spends model credits.

## Two ways to serve it

**You already run a reverse proxy** (the normal case). Leave `COMPOSE_PROFILES` empty. The
container publishes on `127.0.0.1:4249`; point your proxy at it and let it terminate TLS.

```nginx
location / {
    proxy_pass http://127.0.0.1:4249;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
}
```

**Nothing in front of this host.** Set `COMPOSE_PROFILES=tls` and `ACME_EMAIL`. Caddy takes
`:80` and `:443` and obtains a Let's Encrypt certificate automatically. `APP_HOST` must
resolve to this host and both ports must be reachable from the internet.

## Operating

```bash
docker compose ps
docker compose logs -f app
docker compose down            # stop
./install.sh                   # start, or apply a change
curl http://127.0.0.1:4249/api/health
```

Nothing needs backing up except `.env`.

## Troubleshooting

**`app/server.js is missing`** - the package was assembled without a build. The deploy workflow
does this for you; by hand it is `npm ci && npm run build`, then copy `.next/standalone/.`,
`.next/static` and `public/` into `deploy/app/`.

**Health check answers 000** - the container never bound. `docker compose logs app`; the usual
cause is a missing required variable, which the app reports by name on startup.

**`redirect_uri_mismatch`** - `AUTH_URL` and the Google console disagree. They must match
character for character, including scheme and any port.

**Signed in, but told you are not allowed** - your address is not in `AUTH_ALLOWED_EMAILS`.
