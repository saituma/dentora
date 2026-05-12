#!/usr/bin/env bash
# Obtain the initial Let's Encrypt certificate for a fresh VPS deploy.
# Run ONCE before starting the full docker compose stack.
# Usage: bash scripts/bootstrap-ssl.sh app.yoursite.com admin@yoursite.com

set -euo pipefail

DOMAIN="${1:?Usage: $0 DOMAIN EMAIL}"
EMAIL="${2:?Usage: $0 DOMAIN EMAIL}"
APP_DIR="${APP_DIR:-/opt/dental-flow}"

echo "==> Bootstrapping SSL for $DOMAIN"

# Update nginx.conf placeholder
sed -i "s/YOURDOMAIN/$DOMAIN/g" "$APP_DIR/nginx/nginx.conf"
echo "    Updated nginx.conf with domain: $DOMAIN"

# Start only the HTTP stack (nginx serves port 80 for ACME challenge)
# Temporarily use self-signed certs so nginx can start with the HTTPS block
mkdir -p /etc/letsencrypt/live/"$DOMAIN"
if [ ! -f /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ]; then
  echo "    Generating temporary self-signed cert so nginx starts"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/"$DOMAIN"/privkey.pem \
    -out    /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem \
    -subj "/CN=$DOMAIN" 2>/dev/null
fi

echo "    Starting nginx for ACME challenge"
docker compose -f "$APP_DIR/docker-compose.prod.yaml" up -d nginx

echo "    Running certbot to obtain real certificate"
docker compose -f "$APP_DIR/docker-compose.prod.yaml" run --rm certbot \
  certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

echo "    Reloading nginx with real cert"
docker compose -f "$APP_DIR/docker-compose.prod.yaml" exec nginx nginx -s reload

echo ""
echo "==> SSL certificate issued for $DOMAIN"
echo "    Certbot auto-renews every 12h via the certbot service."
echo "    Start the full stack now: docker compose -f docker-compose.prod.yaml up -d"
