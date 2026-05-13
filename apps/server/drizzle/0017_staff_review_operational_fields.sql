ALTER TABLE staff_review_items
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_review_items_tenant_severity_status_sla_idx
  ON staff_review_items(tenant_id, severity, status, sla_due_at);
