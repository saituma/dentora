#!/usr/bin/env bash
# Chaos test: randomly kills containers and verifies recovery.
# Run in STAGING only — never production.
#
# Usage: ./scripts/chaos-test.sh [compose-file]
# Example: ./scripts/chaos-test.sh docker-compose.staging.yaml

set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.prod.yaml}"
HEALTH_URL="${HEALTH_URL:-http://localhost/api/health/ready}"
WAIT_SECONDS="${WAIT_SECONDS:-30}"
PASS=0
FAIL=0

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

check_health() {
  local label="$1"
  local deadline=$(( $(date +%s) + WAIT_SECONDS ))
  while (( $(date +%s) < deadline )); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      log "PASS — recovered after $label"
      (( PASS++ )) || true
      return 0
    fi
    sleep 3
  done
  log "FAIL — did not recover after $label within ${WAIT_SECONDS}s"
  (( FAIL++ )) || true
  return 1
}

kill_and_recover() {
  local service="$1"
  log "Killing $service..."
  docker compose -f "$COMPOSE_FILE" stop "$service"
  sleep 5
  docker compose -f "$COMPOSE_FILE" start "$service"
  check_health "kill $service"
}

log "=== Dentora Chaos Test (STAGING ONLY) ==="
log "Compose: $COMPOSE_FILE"
log "Health: $HEALTH_URL"
echo

# Verify system healthy before starting
log "Pre-flight health check..."
if ! curl -sf "$HEALTH_URL" >/dev/null; then
  log "ERROR: system not healthy before test — aborting"
  exit 1
fi
log "Pre-flight OK"
echo

# Test 1: Kill server (should auto-restart via docker compose restart policy)
kill_and_recover server
sleep 5

# Test 2: Kill worker (jobs should resume when it restarts)
kill_and_recover worker
sleep 5

# Test 3: Kill Redis (server should degrade gracefully — no crash)
log "Killing redis (graceful degradation test)..."
docker compose -f "$COMPOSE_FILE" stop redis
sleep 10
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  log "PASS — API still responds with Redis down (degraded mode)"
  (( PASS++ )) || true
else
  log "FAIL — API crashed when Redis went down"
  (( FAIL++ )) || true
fi
docker compose -f "$COMPOSE_FILE" start redis
sleep 10
check_health "redis restart"

# Test 4: Restart nginx (zero-downtime check)
log "Restarting nginx..."
docker compose -f "$COMPOSE_FILE" restart nginx
sleep 5
check_health "nginx restart"

# Test 5: Kill all at once — full recovery test
log "Killing all services..."
docker compose -f "$COMPOSE_FILE" stop server worker client
sleep 5
docker compose -f "$COMPOSE_FILE" start server worker client
check_health "full restart"

echo
log "=== Results: $PASS passed, $FAIL failed ==="
if (( FAIL > 0 )); then
  exit 1
fi
