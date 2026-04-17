-- tenant_users has RLS (0001) with USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid).
-- For INSERT, PostgreSQL applies WITH CHECK derived from that policy when no INSERT-specific
-- policy exists, so registration fails while app.current_tenant_id is unset.
-- This permissive INSERT policy allows bootstrap inserts; SELECT remains restricted by tenant_isolation.

DROP POLICY IF EXISTS tenant_users_insert_register ON tenant_users;
CREATE POLICY tenant_users_insert_register ON tenant_users
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);
