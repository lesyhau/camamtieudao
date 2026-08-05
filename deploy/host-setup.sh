#!/usr/bin/env bash
# ==============================================================================
# ONE-TIME host bootstrap. Not part of a deploy.
#
#   scp deploy/host-setup.sh user@host:~ && ssh user@host 'sudo bash host-setup.sh'
#
# install.sh is what runs on every deploy and only needs Docker. This installs Docker
# itself, the reverse proxy that owns :443, and the stack directory - the things that
# exist before any deploy and outlive all of them.
#
# Idempotent. Re-running it is how you repair a host or pick up a change here.
#
# It deliberately does NOT request a TLS certificate: issuance needs DNS already pointing
# at this machine, which is a separate step with a separate failure mode. The script tells
# you the exact command to run once DNS is correct.
# ==============================================================================
set -euo pipefail

# Run over SSH with no tty, so debconf tries Dialog, then Readline, then Teletype, and prints
# four lines of complaint about each before falling back. Tell it up front instead.
export DEBIAN_FRONTEND=noninteractive

APP_USER="${APP_USER:-lesyhau}"
APP_HOST="${APP_HOST:-camamtieudao.com}"
HTTP_PORT="${HTTP_PORT:-4249}"
STACK="/opt/camamtieudao"
WEBROOT="/var/www/certbot"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  [WARN] %s\033[0m\n' "$*"; }
die()  { printf '\033[31m  [ERROR] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run this with sudo."
id "$APP_USER" >/dev/null 2>&1 || die "user '$APP_USER' does not exist on this host."

# --- 1. Docker ----------------------------------------------------------------
say "[1/5] Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "  already installed: $(docker --version)"
else
    # Docker's own repository, not Debian's docker.io: the compose *plugin* (v2, invoked as
    # `docker compose`) only ships there, and compose/docker-compose v1 has been end of life
    # since 2023. deploy/docker-compose.yml is v2 syntax.
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg >/dev/null
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin >/dev/null
    echo "  installed: $(docker --version)"
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# The deploy runs install.sh as $APP_USER over SSH. Without this it would need sudo for every
# docker call, and a non-interactive SSH session has no terminal to answer a password prompt.
if id -nG "$APP_USER" | tr ' ' '\n' | grep -qx docker; then
    echo "  $APP_USER is already in the docker group"
else
    usermod -aG docker "$APP_USER"
    warn "$APP_USER added to the docker group - existing SSH sessions keep the OLD groups.
         The next new session picks it up; install.sh falls back to sudo until then."
fi

# --- 2. Stack directory -------------------------------------------------------
say "[2/5] Stack directory"
mkdir -p "$STACK"
chown "$APP_USER:$APP_USER" "$STACK"
echo "  $STACK owned by $APP_USER"
[ -f "$STACK/.env" ] && echo "  .env present - left untouched" || \
    warn "no $STACK/.env yet. The first deploy creates it from .env.example and STOPS,
         because it cannot invent your Google client secret or model key. Fill it in and
         re-run the deploy (or $STACK/install.sh) after that."

# --- 3. nginx -----------------------------------------------------------------
say "[3/5] nginx"
apt-get install -y -qq nginx >/dev/null
mkdir -p "$WEBROOT"
chown -R www-data:www-data "$WEBROOT"

# One config, HTTP only. certbot --nginx rewrites this file in place when it issues, adding
# the 443 server block and the redirect. Writing those ourselves first would leave nginx
# referring to certificate files that do not exist, and nginx refuses to start at all then -
# taking down anything else this host serves.
cat > /etc/nginx/sites-available/camamtieudao.conf <<NGINX
# Managed by deploy/host-setup.sh. certbot appends the TLS server block on first issuance.
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST} www.${APP_HOST};

    # Let's Encrypt HTTP-01. Must stay reachable over plain HTTP forever, including after
    # the redirect to HTTPS is added, or renewal fails 60 days from now with nobody watching.
    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

    location / {
        proxy_pass http://127.0.0.1:${HTTP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # The chat streams its answer; buffering would hold the whole response and deliver it
        # in one lump, which reads as a hang on a request that legitimately takes 30 seconds.
        proxy_buffering off;
        proxy_read_timeout 300s;

        # A sheet photo off a phone is routinely 8-12 MB. nginx's 1 MB default rejects it with
        # a 413 that never reaches the application, so the app cannot explain it.
        client_max_body_size 25m;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/camamtieudao.conf /etc/nginx/sites-enabled/camamtieudao.conf
# Debian's default site answers on :80 for any unmatched Host, which is harmless - but it is
# also the default_server, so leaving it means an unmatched name gets Debian's welcome page
# rather than our app. Only remove the symlink; the file stays for reference.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx
echo "  serving ${APP_HOST} on :80 -> 127.0.0.1:${HTTP_PORT}"

# --- 4. certbot ---------------------------------------------------------------
say "[4/5] certbot"
apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
echo "  $(certbot --version 2>&1)"
# Debian's package ships a systemd timer that renews twice daily. Confirm rather than assume.
systemctl is-enabled certbot.timer >/dev/null 2>&1 \
    && echo "  renewal timer enabled" || warn "certbot.timer is not enabled - renewals will not run"

# --- 5. Readiness -------------------------------------------------------------
say "[5/5] Readiness"
MYIP="$(curl -s -m 10 https://api.ipify.org || echo unknown)"
DNSIP="$(getent hosts "$APP_HOST" | awk '{print $1}' | head -1 || true)"
echo "  this host : ${MYIP}"
echo "  ${APP_HOST} resolves to : ${DNSIP:-<no A record>}"
if [ "$DNSIP" = "$MYIP" ]; then
    echo
    echo "  DNS is correct. Issue the certificate now:"
    echo "    sudo certbot --nginx -d ${APP_HOST} -d www.${APP_HOST} --agree-tos -m YOUR@EMAIL --redirect"
else
    warn "DNS does not point here yet, so a certificate CANNOT be issued.
         Point the A record for ${APP_HOST} (and www) at ${MYIP}, wait for it to
         propagate, then run:
             sudo certbot --nginx -d ${APP_HOST} -d www.${APP_HOST} --agree-tos -m YOUR@EMAIL --redirect"
fi

say "DONE"
echo "  Ports 80 and 443 must also be open in the cloud firewall - that is not something"
echo "  this script can see or change. On GCP: VPC network > Firewall."
