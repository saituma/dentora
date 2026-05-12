#!/usr/bin/env bash
# Provision a fresh Ubuntu 24.04 DigitalOcean Droplet for Dentora.
# Run once as root immediately after first SSH login.
# Usage: bash provision-server.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-dentora}"
APP_DIR="/opt/dental-flow"

echo "==> Installing packages"
apt-get update -q
apt-get install -y -q \
  git curl wget ufw fail2ban \
  docker.io docker-compose-plugin \
  ca-certificates gnupg

echo "==> Enabling Docker"
systemctl enable docker
systemctl start docker

echo "==> Creating deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
fi

echo "==> Setting up app directory: $APP_DIR"
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo "==> Configuring UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP (certbot + redirect)'
ufw allow 443/tcp   comment 'HTTPS'
ufw --force enable
ufw status verbose

echo "==> Hardening SSH (key-only auth)"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

echo "==> Enabling fail2ban"
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "==> Done. Next steps:"
echo "  1. Clone repo: git clone https://github.com/YOUR_ORG/dental-flow $APP_DIR"
echo "  2. Copy .env.production to $APP_DIR/.env.production"
echo "  3. Set DOMAIN in nginx/nginx.conf"
echo "  4. Run: bash $APP_DIR/scripts/bootstrap-ssl.sh YOUR_DOMAIN YOUR@EMAIL"
echo "  5. Run: docker compose -f $APP_DIR/docker-compose.prod.yaml up -d"
