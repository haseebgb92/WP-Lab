#!/usr/bin/env bash
set -euo pipefail

P="$1"
PORT="${2:-8085}"
PROJECT="${3:-wp-lab}"
cd "$P"

dc(){ docker compose -p "$PROJECT" "$@"; }

for i in {1..45}; do
  if dc exec -T wpcli wp core is-installed >/dev/null 2>&1; then
    break
  fi
  if dc exec -T wpcli wp core install       --url="http://localhost:$PORT"       --title="WP Lab"       --admin_user=admin       --admin_password=admin       --admin_email=admin@example.test       --skip-email >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

dc exec -T wpcli wp option update home "http://localhost:$PORT" >/dev/null 2>&1 || true
dc exec -T wpcli wp option update siteurl "http://localhost:$PORT" >/dev/null 2>&1 || true
dc exec -T wpcli wp plugin activate wp-lab-helper >/dev/null 2>&1 || true
dc exec -T wpcli wp plugin install woocommerce --activate >/dev/null 2>&1 || true
dc exec -T wpcli wp option update permalink_structure '/%postname%/' >/dev/null 2>&1 || true
dc exec -T wpcli wp rewrite flush --hard >/dev/null 2>&1 || true
dc exec -T wpcli wp wp-lab configure-woocommerce >/dev/null 2>&1 || true
dc exec -T wordpress chmod -R a+rwX /var/www/html/wp-content >/dev/null 2>&1 || true

echo "WP Lab ready at http://localhost:$PORT  admin/admin"
