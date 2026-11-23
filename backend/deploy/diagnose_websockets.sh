#!/usr/bin/env bash
# deploy/diagnose_websockets.sh — why do wss://api.wazipos.co.ke/ws/... fail?
#
#   sudo bash deploy/diagnose_websockets.sh            (from /var/www/wazipos/backend)
#   VENV=/path/to/venv WS_PORT=8001 sudo -E bash deploy/diagnose_websockets.sh
#
# Read-only: it only looks (services, ports, nginx, Redis, a test import of the ASGI app).
# nginx answering 502 on /ws/ means nothing is listening where nginx sends /ws/.

set -u
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
VENV="${VENV:-/var/www/wazipos/waziposenv}"
WS_PORT="${WS_PORT:-8001}"
ok()   { printf "  \033[32m✔\033[0m %s\n" "$*"; }
bad()  { printf "  \033[31m✘\033[0m %s\n" "$*"; }
info() { printf "  · %s\n" "$*"; }
hr()   { printf "\n\033[1m%s\033[0m\n" "$*"; }

hr "1. App folder and virtualenv"
info "APP_DIR=$APP_DIR"
if [ -x "$VENV/bin/python" ]; then ok "venv: $VENV"; else bad "no venv at $VENV (set VENV=...)"; fi
for pkg in daphne channels channels_redis; do
  if "$VENV/bin/python" -c "import $pkg" 2>/dev/null; then ok "$pkg installed"; else bad "$pkg NOT installed in the venv"; fi
done

hr "2. Services that could run the WebSocket (ASGI) server"
systemctl list-units --type=service --all 2>/dev/null | grep -Ei "daphne|uvicorn|asgi|gunicorn|wazi" || info "no daphne/uvicorn/gunicorn/wazi services found"
for s in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -Ei "daphne|uvicorn|asgi|wazi"); do
  info "$s: $(systemctl is-active "$s")  ($(systemctl show -p ExecStart --value "$s" | head -c 200))"
done

hr "3. What is listening (python / daphne / uvicorn / gunicorn)"
ss -ltnp 2>/dev/null | grep -Ei "python|daphne|uvicorn|gunicorn" || bad "no Python server listening on any port"

hr "4. Where nginx sends /ws/"
NGX=$(grep -Rln "server_name.*api.wazipos.co.ke" /etc/nginx/sites-enabled 2>/dev/null | head -1)
if [ -n "$NGX" ]; then
  info "config: $NGX"
  grep -n -A10 "location /ws" "$NGX" || bad "no 'location /ws' block: /ws/ goes to the HTTP upstream (which may not speak WebSocket)"
  PORT=$(grep -A10 "location /ws" "$NGX" | grep -oE "proxy_pass[^;]*" | grep -oE ":[0-9]+" | head -1 | tr -d :)
  if [ -n "${PORT:-}" ]; then
    if ss -ltn | grep -q ":$PORT "; then ok "something listens on :$PORT"; else bad "nginx sends /ws/ to :$PORT but NOTHING listens there  ← the 502"; fi
  fi
  grep -A10 "location /ws" "$NGX" | grep -qi "upgrade" && ok "Upgrade headers set" || bad "missing: proxy_set_header Upgrade / Connection \"upgrade\""
else
  bad "no nginx site with server_name api.wazipos.co.ke under /etc/nginx/sites-enabled"
fi

hr "5. Redis (channel layer, 127.0.0.1:6379)"
if command -v redis-cli >/dev/null && [ "$(redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null)" = "PONG" ]; then ok "Redis answers PONG"; else bad "Redis not answering on 127.0.0.1:6379 (sockets connect then fail)"; fi

hr "6. Can the ASGI app load? (the exact error if not)"
cd "$APP_DIR" && DJANGO_SETTINGS_MODULE=wazi.settings.production "$VENV/bin/python" - <<'PY'
import traceback
try:
    from wazi.asgi import application
    print("  \033[32m✔\033[0m wazi.asgi:application loads")
except Exception:
    print("  \033[31m✘\033[0m wazi.asgi failed to load — this is why the WebSocket server won't start:")
    traceback.print_exc()
PY

hr "7. Recent logs of the WebSocket service"
for s in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -Ei "daphne|uvicorn|asgi"); do
  info "journalctl -u $s (last 30 lines):"
  journalctl -u "$s" -n 30 --no-pager 2>/dev/null | sed 's/^/    /'
done

hr "Next"
info "No WebSocket service? Install deploy/wazipos-daphne.service (see the comments in it)."
info "nginx: use the 'location /ws/' block from deploy/nginx-websockets.conf, then: sudo nginx -t && sudo systemctl reload nginx"
