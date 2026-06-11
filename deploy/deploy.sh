#!/usr/bin/env bash
# Deploys WordSwipe to the Hetzner server. Run from the repo root on your machine:
#   ./deploy/deploy.sh
# Statics (web/admin) are built locally; the API image is built on the server (ARM64).
# HTTPS is served by the HOST Caddy — deploy.sh installs/updates the site block.
set -euo pipefail

SERVER="${SERVER:-root@46.225.113.117}"
DIR=/opt/wordswipe

cd "$(dirname "$0")/.."

echo "── 1/5 Building shared + web + admin locally..."
pnpm --filter @wordswipe/shared build
VITE_API_URL='' pnpm --filter web build
VITE_API_URL='' pnpm --filter admin build

echo "── 2/5 Syncing project to $SERVER:$DIR ..."
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude 'packages/api/dist' \
  --exclude 'packages/shared/dist' \
  --exclude backups \
  ./ "$SERVER:$DIR/"

echo "── 3/5 Building and starting containers on the server..."
ssh "$SERVER" "cd $DIR && docker compose -f docker-compose.prod.yml up -d --build"

echo "── 4/5 Applying database schema..."
ssh "$SERVER" "cd $DIR && docker compose -f docker-compose.prod.yml exec -T api npx prisma db push --skip-generate"

echo "── 5/5 Updating host Caddy site block..."
ssh "$SERVER" "python3 - <<'PYEOF'
import re, subprocess
site = open('$DIR/deploy/Caddyfile').read()
path = '/etc/caddy/Caddyfile'
current = open(path).read()
marker_start, marker_end = '# === wordswipe start ===', '# === wordswipe end ==='
block = f'{marker_start}\n{site}\n{marker_end}'
if marker_start in current:
    current = re.sub(re.escape(marker_start) + '.*?' + re.escape(marker_end), block, current, flags=re.S)
else:
    # Remove any pre-existing bare site blocks for the domain, then append ours
    current = current.rstrip() + '\n\n' + block + '\n'
open(path, 'w').write(current)
subprocess.run(['systemctl', 'reload', 'caddy'], check=True)
print('caddy reloaded')
PYEOF"

echo "✅ Deployed → https://bunyodjonov.uz"
