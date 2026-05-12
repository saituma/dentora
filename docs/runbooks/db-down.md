# Runbook: PostgreSQL Down

**Symptoms**: `/api/health/ready` returns `{"status":"not_ready","database":false}`, 503 responses on all data endpoints.

---

## 1. Diagnose

```bash
# Check container status
docker-compose -f docker-compose.prod.yaml ps postgres

# Check postgres logs
docker-compose -f docker-compose.prod.yaml logs --tail=100 postgres

# Test connection directly
docker-compose -f docker-compose.prod.yaml exec postgres \
  pg_isready -U ${POSTGRES_USER:-dental_flow}
```

---

## 2. Common causes and fixes

### Container crashed / OOM killed

```bash
docker-compose -f docker-compose.prod.yaml up -d postgres
```

Check `docker stats` — if consistently near 512M limit, increase `memory: 512M` in compose or free disk space.

### Disk full

```bash
df -h /var/lib/docker
# If full: remove unused Docker images/volumes
docker image prune -f
docker volume prune -f  # CAREFUL — only prune if you know which volumes are unused
```

### Postgres refusing connections (max_connections hit)

```bash
docker-compose -f docker-compose.prod.yaml exec postgres \
  psql -U ${POSTGRES_USER} -c "SELECT count(*) FROM pg_stat_activity;"
# Kill idle connections:
docker-compose -f docker-compose.prod.yaml exec postgres \
  psql -U ${POSTGRES_USER} -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '5 minutes';"
```

### Data directory corruption (worst case)

1. Stop postgres: `docker-compose -f docker-compose.prod.yaml stop postgres`
2. Restore from latest backup (see backup-postgres.ts output in Spaces)
3. Run migrations: `docker-compose exec server node apps/server/dist/scripts/migrate.js`

---

## 3. Restore from backup

```bash
# Download latest encrypted backup from DO Spaces
# Decrypt with ENCRYPTION_KEY (see rotate-secrets.ts for format)
# Restore:
psql "$DATABASE_URL" < dump.sql
```

---

## 4. After recovery

- Verify `/api/health/ready` returns `{"status":"ready"}`
- Check audit logs are writing: make a test request and query `audit_log`
- Post incident update in `#incident-YYYY-MM-DD`
