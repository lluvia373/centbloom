-- Disable ingestion before running. Retain collected records and revisions for recovery.
begin;
revoke execute on function public.ingest_economic_releases(jsonb) from service_role;
revoke select on public.economic_releases from anon,authenticated;
commit;
-- Restore by re-granting these exact privileges after verification; no DROP/TRUNCATE.
