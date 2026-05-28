#!/usr/bin/env bash
# Obtain initial Let's Encrypt certificates for a fresh server deploy.
# Run ONCE before starting the full docker compose stack.
# Usage: bash scripts/bootstrap-ssl.sh app.dentora.com admin.dentora.com admin@dentora.com

set -euo pipefail

APP_DOMAIN="${1:?Usage: $0 APP_DOMAIN ADMIN_DOMAIN EMAIL}"
ADMIN_DOMAIN="${2:?Usage: $0 APP_DOMAIN ADMIN_DOMAIN EMAIL}"
EMAIL="${3:?Usage: $0 APP_DOMAIN ADMIN_DOMAIN EMAIL}"
APP_DIR="${APP_DIR:-/opt/dentora}"

echo "==> Bootstrapping SSL"
echo "    App domain  : $APP_DOMAIN"
echo "    Admin domain: $ADMIN_DOMAIN"
echo "    Email       : $EMAIL"

# Patch nginx.conf with real domain names
sed -i "s/YOURDOMAIN/$APP_DOMAIN/g" "$APP_DIR/nginx/nginx.conf"
sed -i "s/YOURADMINDOMAIN/$ADMIN_DOMAIN/g" "$APP_DIR/nginx/nginx.conf"
echo "    Updated nginx.conf"

# Create temporary self-signed certs so nginx can start with HTTPS blocks
for DOMAIN in "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
  mkdir -p /etc/letsencrypt/live/"$DOMAIN"
  if [ ! -f /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ]; then
    echo "    Generating temporary self-signed cert for $DOMAIN"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/"$DOMAIN"/privkey.pem \
      -out    /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem \
      -subj "/CN=$DOMAIN" 2>/dev/null
  fi
done

echo "    Starting nginx for ACME challenge"
docker compose -f "$APP_DIR/docker-compose.prod.yaml" up -d nginx

sleep 3

# Issue real certificates
for DOMAIN in "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
  echo "    Issuing certificate for $DOMAIN"
  docker compose -f "$APP_DIR/docker-compose.prod.yaml" run --rm certbot \
    certbot certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      --email "$EMAIL" \
      --agree-tos \
      --no-eff-email \
      -d "$DOMAIN"
done

echo "    Reloading nginx with real certificates"
docker compose -f "$APP_DIR/docker-compose.prod.yaml" exec nginx nginx -s reload

echo ""
echo "==> SSL certificates issued for $APP_DOMAIN and $ADMIN_DOMAIN"
echo "    Certbot auto-renews every 12h."
echo ""
echo "    Start the full stack:"
echo "    docker compose -f $APP_DIR/docker-compose.prod.yaml up -d"
