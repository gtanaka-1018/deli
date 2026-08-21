-- 億メーター 公開ランキング用Supabaseスキーマ
-- Supabase SQL Editorで実行する。公開値は自己申告であり、売上明細やメールアドレスは保存しない。

create table if not exists public.ranking_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_profiles_display_name_length
    check (char_length(display_name) between 1 and 20),
  constraint ranking_profiles_display_name_trimmed
    check (display_name = btrim(display_name)),
  constraint ranking_profiles_display_name_no_control_characters
    check (display_name !~ '[[:cntrl:]]')
);

create table if not exists public.ranking_assets (
  user_id uuid primary key references public.ranking_profiles(user_id) on delete cascade,
  net_assets bigint not null,
  updated_at timestamptz not null default now(),
  constraint ranking_assets_reasonable_range
    check (net_assets between -1000000000000 and 1000000000000000)
);

create table if not exists public.ranking_daily_sales (
  user_id uuid not null references public.ranking_profiles(user_id) on delete cascade,
  sales_date date not null,
  delivery_count integer not null,
  sales_amount bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, sales_date),
  constraint ranking_daily_sales_count_range
    check (delivery_count between 0 and 10000),
  constraint ranking_daily_sales_amount_range
    check (sales_amount between 0 and 100000000)
);

create index if not exists ranking_assets_amount_idx
  on public.ranking_assets (net_assets desc, updated_at desc);

create index if not exists ranking_daily_sales_order_idx
  on public.ranking_daily_sales (sales_date desc, sales_amount desc, delivery_count desc);

alter table public.ranking_profiles enable row level security;
alter table public.ranking_assets enable row level security;
alter table public.ranking_daily_sales enable row level security;

revoke all on public.ranking_profiles from anon, authenticated;
revoke all on public.ranking_assets from anon, authenticated;
revoke all on public.ranking_daily_sales from anon, authenticated;

grant select, insert, update, delete on public.ranking_profiles to authenticated;
grant select, insert, update, delete on public.ranking_assets to authenticated;
grant select, insert, update, delete on public.ranking_daily_sales to authenticated;

drop policy if exists "ranking profiles are owned by the signed in user" on public.ranking_profiles;
create policy "ranking profiles are owned by the signed in user"
  on public.ranking_profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ranking assets are owned by the signed in user" on public.ranking_assets;
create policy "ranking assets are owned by the signed in user"
  on public.ranking_assets
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ranking daily sales are owned by the signed in user" on public.ranking_daily_sales;
create policy "ranking daily sales are owned by the signed in user"
  on public.ranking_daily_sales
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.sync_my_rankings(
  p_display_name text,
  p_net_assets bigint,
  p_daily_sales jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_item jsonb;
  v_date date;
  v_count integer;
  v_sales bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(v_name) not between 1 and 20 then
    raise exception 'display name must be between 1 and 20 characters';
  end if;
  if p_net_assets is null or p_net_assets not between -1000000000000 and 1000000000000000 then
    raise exception 'net assets are outside the accepted range';
  end if;
  if p_daily_sales is null
    or coalesce(jsonb_typeof(p_daily_sales), '') <> 'array'
    or jsonb_array_length(p_daily_sales) > 31 then
    raise exception 'daily sales must be an array of at most 31 entries';
  end if;

  insert into public.ranking_profiles (user_id, display_name, consented_at, updated_at)
  values (v_user_id, v_name, now(), now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.ranking_assets (user_id, net_assets, updated_at)
  values (v_user_id, p_net_assets, now())
  on conflict (user_id) do update
    set net_assets = excluded.net_assets,
        updated_at = now();

  delete from public.ranking_daily_sales where user_id = v_user_id;

  for v_item in select value from jsonb_array_elements(p_daily_sales)
  loop
    v_date := (v_item ->> 'date')::date;
    v_count := (v_item ->> 'count')::integer;
    v_sales := (v_item ->> 'sales')::bigint;

    if v_date < current_date - 29 or v_date > current_date then
      raise exception 'daily sales date is outside the latest 30 days';
    end if;
    if v_count not between 0 and 10000 or v_sales not between 0 and 100000000 then
      raise exception 'daily sales values are outside the accepted range';
    end if;

    insert into public.ranking_daily_sales (
      user_id, sales_date, delivery_count, sales_amount, updated_at
    ) values (
      v_user_id, v_date, v_count, v_sales, now()
    );
  end loop;
end;
$$;

create or replace function public.leave_rankings()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.ranking_profiles where user_id = auth.uid();
$$;

create or replace function public.get_my_ranking_status()
returns table (is_participating boolean, display_name text, updated_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1 from public.ranking_profiles p where p.user_id = auth.uid()
    ),
    (
      select p.display_name from public.ranking_profiles p where p.user_id = auth.uid()
    ),
    (
      select p.updated_at from public.ranking_profiles p where p.user_id = auth.uid()
    );
$$;

create or replace function public.get_asset_rankings(p_limit integer default 100)
returns table (
  rank bigint,
  display_name text,
  net_assets bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ranked.rank, ranked.display_name, ranked.net_assets, ranked.updated_at
  from (
    select
      dense_rank() over (order by a.net_assets desc) as rank,
      p.display_name,
      a.net_assets,
      a.updated_at
    from public.ranking_assets a
    join public.ranking_profiles p on p.user_id = a.user_id
  ) ranked
  order by ranked.rank, ranked.updated_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

create or replace function public.get_daily_sales_rankings(p_limit integer default 100)
returns table (
  rank bigint,
  display_name text,
  sales_date date,
  delivery_count integer,
  sales_amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ranked.rank,
    ranked.display_name,
    ranked.sales_date,
    ranked.delivery_count,
    ranked.sales_amount
  from (
    select
      dense_rank() over (order by d.sales_amount desc) as rank,
      p.display_name,
      d.sales_date,
      d.delivery_count,
      d.sales_amount
    from public.ranking_daily_sales d
    join public.ranking_profiles p on p.user_id = d.user_id
    where d.sales_date >= current_date - 29
      and (d.sales_amount > 0 or d.delivery_count > 0)
  ) ranked
  order by ranked.rank, ranked.sales_date desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

revoke execute on function public.sync_my_rankings(text, bigint, jsonb) from public, anon;
revoke execute on function public.leave_rankings() from public, anon;
revoke execute on function public.get_my_ranking_status() from public, anon;
revoke execute on function public.get_asset_rankings(integer) from public;
revoke execute on function public.get_daily_sales_rankings(integer) from public;

grant execute on function public.sync_my_rankings(text, bigint, jsonb) to authenticated;
grant execute on function public.leave_rankings() to authenticated;
grant execute on function public.get_my_ranking_status() to authenticated;
grant execute on function public.get_asset_rankings(integer) to anon, authenticated;
grant execute on function public.get_daily_sales_rankings(integer) to anon, authenticated;
