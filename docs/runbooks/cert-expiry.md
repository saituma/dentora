# Runbook: SSL Certificate Expiry

Let's Encrypt certificates expire every 90 days. The certbot container in docker-compose.prod.yaml renews every 12 hours — this should be automatic. This runbook covers what to do if renewal fails.

---

## 1. Check certificate status

```bash
# From outside the server
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Or from Datadog Synthetic Monitor — configure cert expiry alert at < 14 days
```

---

## 2. Check certbot logs

```bash
docker-compose -f docker-compose.prod.yaml logs certbot | tail -50
```

Common failure: `Challenge failed for domain` — usually means port 80 is blocked or nginx isn't serving `/.well-known/acme-challenge/`.

---

## 3. Manual renewal

```bash
# Force a renewal attempt
docker-compose -f docker-compose.prod.yaml exec certbot \
  certbot renew --webroot -w /var/www/certbot --force-renewal

# Reload nginx to pick up new cert
docker-compose -f docker-compose.prod.yaml exec nginx nginx -s reload
```

---

## 4. First-time or emergency cert via bootstrap script

If certbot volume is lost or cert is fully expired:

```bash
bash apps/server/scripts/bootstrap-ssl.sh yourdomain.com your@email.com
```

Then restart nginx.

---

## 5. Verify

```bash
curl -v https://yourdomain.com/api/health 2>&1 | grep -E "SSL|certificate|expire"
# SSL Labs check:
# ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

---

## 6. Prevent future issues

- Datadog Synthetic Monitor: set cert expiry alert at 14 days remaining
- Alternatively use `check_ssl_cert` script in a cron job:
  ```bash
  0 8 * * * /usr/local/bin/check_cert.sh yourdomain.com 14
  ```
