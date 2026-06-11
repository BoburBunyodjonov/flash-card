#!/usr/bin/env bash
# One-time server preparation (Ubuntu/Debian, run as root). Idempotent.
set -euo pipefail

echo "── Installing Docker, firewall, fail2ban..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw fail2ban rsync >/dev/null

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "── Firewall: allow only SSH/HTTP/HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "── fail2ban for SSH"
systemctl enable --now fail2ban

echo "── SSH hardening: keys only"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

mkdir -p /opt/wordswipe/backups

echo "── Done. Server ready for deploy."
