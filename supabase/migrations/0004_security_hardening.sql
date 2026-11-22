-- ============================================================================
-- WORKISM 3.0 — Migration 0004: Rate Limit Pruning & Hardening
-- ============================================================================

create index if not exists idx_rate_limit_buckets_reset on public.rate_limit_buckets(reset_at);

-- Keep rate_limit_buckets bounded by opportunistically pruning expired buckets (> 1 day old).
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_new_reset timestamptz := v_now + make_interval(secs => p_window_seconds);
  v_hits int;
  v_reset timestamptz;
begin
  if random() < 0.02 then
    delete from public.rate_limit_buckets where public.rate_limit_buckets.reset_at < v_now - interval '1 day';
  end if;

  insert into public.rate_limit_buckets (bucket_key, hits, reset_at)
  values (p_key, 1, v_new_reset)
  on conflict (bucket_key) do update
  set
    hits = case when public.rate_limit_buckets.reset_at <= v_now then 1 else public.rate_limit_buckets.hits + 1 end,
    reset_at = case when public.rate_limit_buckets.reset_at <= v_now then v_new_reset else public.rate_limit_buckets.reset_at end
  returning public.rate_limit_buckets.hits, public.rate_limit_buckets.reset_at
  into v_hits, v_reset;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  reset_at := v_reset;
  return next;
end;
$$;
