#!/usr/bin/env bash
# ==============================================================================
# Cam Am Tieu Dao - installer. Run on the host, from this directory.
#
#   ./install.sh
#
# Idempotent: re-running it is how a config change or a new build is applied.
#
# Non-interactive (CI): set CAMAM_ASSUME_YES=1 with a complete .env. The script
# then fails rather than prompting.
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

ASSUME_YES="${CAMAM_ASSUME_YES:-0}"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  [WARN] %s\033[0m\n' "$*"; }
die()  { printf '\033[31m  [ERROR] %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Prerequisites ---------------------------------------------------------
say "[1/4] Prerequisites"
command -v docker >/dev/null 2>&1 || die "docker is not installed. See INSTALL.md."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed."
if docker info >/dev/null 2>&1; then
    DOCKER="docker"
elif sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    warn "using sudo for docker - add yourself to the docker group to avoid this"
else
    die "cannot talk to the docker daemon, with or without sudo."
fi
[ -f app/server.js ] || die "app/server.js is missing, so there is nothing to run.
          This directory expects a built Next standalone bundle beside it:
              npm ci && npm run build
              mkdir -p deploy/app && cp -r .next/standalone/. deploy/app/
              cp -r .next/static deploy/app/.next/static && cp -r public deploy/app/public"
echo "  $($DOCKER --version)"

# --- 2. Configuration ---------------------------------------------------------
say "[2/4] Configuration"
if [ ! -f .env ]; then
    cp .env.example .env
    chmod 600 .env
    echo "  created .env from .env.example"
    if [ "$ASSUME_YES" != "1" ]; then
        echo
        echo "  Edit .env now, then run this script again:"
        echo "    \$EDITOR $DIR/.env"
        exit 0
    fi
else
    echo "  .env exists - leaving your settings alone"
fi

# .env is read by docker compose itself, never sourced into this shell - a stray unquoted
# value in it would otherwise execute here.
envget() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
envset() { local k="$1" v="$2"; if grep -qE "^$k=" .env; then
             # `|` as the sed delimiter: base64 secrets and URLs both contain `/`.
             sed -i "s|^$k=.*|$k=$v|" .env
           else printf '%s=%s\n' "$k" "$v" >> .env; fi; }

# An EMPTY COMPOSE_PROFILES is valid here and is the normal case - the app service carries no
# profile, so it starts either way. (proxyma-landing dies on empty because there the container
# IS the server; here the profile only adds Caddy.)
PROFILES="$(envget COMPOSE_PROFILES)"
echo "  profile: ${PROFILES:-<none - app on loopback, your proxy in front>}"

if [ -z "$(envget AUTH_SECRET)" ]; then
    envset AUTH_SECRET "$(openssl rand -base64 32)"
    echo "  generated AUTH_SECRET"
fi

# Requirements depend on which front ends are switched on. Zalo is the first release; the web
# UI and the paid tier are optional, and demanding their config would block a Zalo-only deploy.
if [ -z "$(envget MESSENGER_PAGE_TOKEN)" ] && [ -z "$(envget ZALO_OA_ACCESS_TOKEN)" ]; then
    warn "neither MESSENGER_PAGE_TOKEN nor ZALO_OA_ACCESS_TOKEN is set - no front end can reply."
fi
[ -n "$(envget MESSENGER_PAGE_TOKEN)" ] && [ -z "$(envget MESSENGER_APP_SECRET)" ] && warn     "MESSENGER_APP_SECRET is empty - webhooks are accepted WITHOUT signature verification."
[ -n "$(envget MESSENGER_PAGE_TOKEN)" ] && [ -z "$(envget MESSENGER_VERIFY_TOKEN)" ] && warn     "MESSENGER_VERIFY_TOKEN is empty - Meta's setup handshake will fail."
true  # the two `&&` chains above must not decide this script's exit status under set -e
[ -n "$(envget ZALO_OA_SECRET)" ] || warn     "ZALO_OA_SECRET is empty - webhooks are accepted WITHOUT signature verification.
         Fine for the first handshake, not for anything after it."
[ -n "$(envget LLM_API_KEY)" ] || echo "  no LLM_API_KEY: paid tier disabled, free tier unaffected"

if [ -n "$(envget AUTH_URL)" ]; then
    case "$(envget AUTH_URL)" in
        https://*|http://localhost*) ;;
        *) die "AUTH_URL must be an absolute origin, e.g. https://camamtieudao.com
          Google rejects the callback otherwise, with redirect_uri_mismatch." ;;
    esac
    for required in AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET; do
        [ -n "$(envget "$required")" ] || die "AUTH_URL is set, so $required is required too."
    done
    [ -n "$(envget AUTH_ALLOWED_EMAILS)" ] || warn         "AUTH_ALLOWED_EMAILS is empty: ANY Google account can sign in."
fi

if [[ ",$PROFILES," == *",tls,"* ]] && [ -z "$(envget ACME_EMAIL)" ]; then
    [ "$ASSUME_YES" = "1" ] && die "ACME_EMAIL is required when the tls profile is on."
    read -r -p "  Email for Let's Encrypt expiry notices: " EMAIL
    [ -n "$EMAIL" ] || die "refusing to continue without ACME_EMAIL"
    envset ACME_EMAIL "$EMAIL"
fi

# --- 3. Build and start -------------------------------------------------------
say "[3/4] Building the runtime image"
$DOCKER compose build

say "[4/4] Starting"
$DOCKER compose up -d --remove-orphans
echo
$DOCKER compose ps

# --- Check --------------------------------------------------------------------
PORT="$(envget HTTP_PORT)"; PORT="${PORT:-4249}"
BIND="$(envget BIND_ADDR)"; BIND="${BIND:-127.0.0.1}"
say "Checking"
# The status code, not curl's exit code: `curl -f` collapses "connection refused" and "404"
# into one failure, which sends you looking at the wrong layer.
for i in $(seq 1 24); do
    # `|| true` on the ASSIGNMENT, not `|| echo 000` inside the substitution. curl already
    # writes 000 to stdout when it cannot connect, so the old inner fallback appended a second
    # one and produced "000000" - which matches neither arm below and fell through to the
    # hard-error case, reporting a container that was merely still starting as a failed
    # deploy. The `|| true` is still required: without it, curl's non-zero exit on a refused
    # connection aborts the whole script under `set -e`, which is what the old form was
    # accidentally preventing.
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://${BIND}:${PORT}/api/health" 2>/dev/null) || true
    CODE="${CODE:-000}"
    case "$CODE" in
        200) echo "  serving on http://${BIND}:${PORT}"
             say "DONE"
             ORIGIN="$(envget AUTH_URL)"
             [ -n "$ORIGIN" ] && echo "  Web origin:   $ORIGIN"
             echo "  Zalo webhook: https://$(envget APP_HOST)/api/webhook/zalo"
             [ -n "$PROFILES" ] || echo "  Point your reverse proxy at http://${BIND}:${PORT}"
             exit 0 ;;
        000) ;;  # not up yet - keep waiting
        *)   warn "http://${BIND}:${PORT}/api/health answered $CODE, expected 200"
             $DOCKER compose logs --tail 40 app
             exit 1 ;;
    esac
    sleep 5
done
warn "no answer at all on http://${BIND}:${PORT} after 120s - the container never bound"
$DOCKER compose logs --tail 60 app
exit 1
