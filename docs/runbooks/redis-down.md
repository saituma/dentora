# Runbook: Redis Down

**Symptoms**: `/api/health/ready` returns `{"status":"not_ready","redis":false}`, rate limiting fails open, OAuth exchange fails, BullMQ workers stall.

---

## 1. Diagnose

```bash
docker-compose -f docker-compose.prod.yaml ps redis
docker-compose -f docker-compose.prod.yaml logs --tail=100 redis

# Test ping
docker-compose -f docker-compose.prod.yaml exec redis \
  redis-cli -a "${REDIS_PASSWORD}" ping
```

---

## 2. Common causes and fixes

### Container crashed

```bash
docker-compose -f docker-compose.prod.yaml up -d redis
```

### OOM — maxmemory limit hit with `noeviction` policy

Current config uses `allkeys-lru` so Redis evicts old keys rather than refusing writes — this is safe. If Redis is crashing due to OOM on the Droplet:

```bash
# Check Droplet memory
free -h
# Reduce maxmemory in docker-compose.prod.yaml if needed (currently 256mb)
```

### Persistence / AOF corruption

```bash
docker-compose -f docker-compose.prod.yaml exec redis \
  redis-cli -a "${REDIS_PASSWORD}" DEBUG RELOAD
# Or wipe and restart (loses all cached data — safe, it's a cache):
docker-compose -f docker-compose.prod.yaml stop redis
docker volume rm dental-flow_redisdata
docker-compose -f docker-compose.prod.yaml up -d redis
```

---

## 3. Impact while Redis is down

| Feature                    | Behaviour                                              |
| -------------------------- | ------------------------------------------------------ |
| Rate limiting              | Fails **open** (requests pass through)                 |
| OAuth exchange cookie      | Fails — users cannot complete Google login             |
| Twilio webhook idempotency | Fails **open** (duplicate webhooks may process)        |
| BullMQ                     | Jobs cannot be enqueued or processed                   |
| Tenant config cache        | Falls back to DB on every request (slower but correct) |

The API remains functional for most operations. Priority is restoring Redis before users notice OAuth or job queue issues.

---

## 4. After recovery

- Verify `redis-cli ping` returns PONG
- Verify `/api/health/ready` returns `{"status":"ready","redis":true}`
- Check BullMQ worker resumed: look for `Worker started` in worker logs
- Post incident update
