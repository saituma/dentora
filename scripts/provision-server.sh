#!/usr/bin/env bash
# Provision a fresh Hetzner Ubuntu 24.04 server for Dentora.
# Run once as root immediately after first SSH login.
# Usage: bash provision-server.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-dentora}"
APP_DIR="/opt/dentora"
GHCR_USER="${GHCR_USER:-}"   # your GitHub username or org
GHCR_TOKEN="${GHCR_TOKEN:-}" # GitHub personal access token with read:packages

echo "==> System update"
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q \
  git curl wget ufw fail2ban \
  ca-certificates gnupg lsb-release \
  htop jq unzip

echo "==> Installing Docker CE (official)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable docker
systemctl start docker

echo "==> Creating deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

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

echo "==> Hardening SSH"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

echo "==> Enabling fail2ban"
systemctl enable fail2ban
systemctl start fail2ban

echo "==> Setting up log rotation for Docker"
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

if [ -n "$GHCR_USER" ] && [ -n "$GHCR_TOKEN" ]; then
  echo "==> Logging in to GitHub Container Registry (GHCR)"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
  # Store creds for the deploy user too
  mkdir -p /home/"$DEPLOY_USER"/.docker
  cp /root/.docker/config.json /home/"$DEPLOY_USER"/.docker/config.json
  chown -R "$DEPLOY_USER:$DEPLOY_USER" /home/"$DEPLOY_USER"/.docker
  echo "    GHCR login saved for $DEPLOY_USER"
else
  echo "    Skipping GHCR login (set GHCR_USER and GHCR_TOKEN to log in now)"
fi

echo "==> Setting up daily DB backup cron (runs at 3am)"
mkdir -p /opt/dentora/backups
cat > /etc/cron.d/dentora-backup <<'EOF'
0 3 * * * dentora /opt/dentora/scripts/backup-db.sh >> /var/log/dentora-backup.log 2>&1
EOF

echo ""
echo "==> Done. Next steps:"
echo ""
echo "  1. Clone repo:"
echo "     git clone https://github.com/YOUR_ORG/dentora $APP_DIR"
echo "     chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR"
echo ""
echo "  2. Copy environment file:"
echo "     cp $APP_DIR/.env.production.example $APP_DIR/.env.production"
echo "     nano $APP_DIR/.env.production   # fill in all secrets"
echo ""
echo "  3. Add deploy SSH public key to $DEPLOY_USER's authorized_keys:"
echo "     mkdir -p /home/$DEPLOY_USER/.ssh"
echo "     echo 'ssh-ed25519 AAAA...' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "     chmod 700 /home/$DEPLOY_USER/.ssh"
echo "     chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys"
echo ""
echo "  4. Bootstrap SSL (run as $DEPLOY_USER from $APP_DIR):"
echo "     bash scripts/bootstrap-ssl.sh app.dentora.com admin.dentora.com admin@dentora.com"
echo ""
echo "  5. Set image tags in .env.production and start the stack:"
echo "     docker compose -f docker-compose.prod.yaml up -d"
