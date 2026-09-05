-- 億メーター 端末間同期（クラウド金庫）用Supabaseスキーマ
--
-- Supabase SQL Editorで実行する。何度実行しても同じ結果になる（冪等）。
--
-- 設計方針:
--   * 売上・経費・稼働時間・車両・資産などの機微データは、公開ランキング用テーブルとは
--     物理的に分離した app_private スキーマへ置く。app_private は PostgREST の
--     Exposed schemas に含めないため、RESTから直接テーブルを読むことはできない。
--   * 読み書きは public に置いた security invoker のRPCだけを通す。ランキング側の
--     security definer 関数（anonにも実行権限がある）から機微データへ到達する経路を
--     構造的に作らない。
--   * 端末間の競合はサーバー採番の revision による楽観的並行制御で検出する。
--     自動マージも自動上書きもしない。置き換えられる前の内容は必ず世代表へ退避する。

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
grant usage on schema app_private to authenticated;

create table if not exists app_private.sync_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  payload text not null,
  encoding text not null,
  schema_version integer not null,
  byte_size integer not null,
  record_count integer not null,
  device_id text not null,
  device_label text not null default '',
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sync_snapshots_payload_size
    check (char_length(payload) between 2 and 4000000),
  constraint sync_snapshots_encoding_allowed
    check (encoding in ('gzip-base64', 'json')),
  constraint sync_snapshots_schema_range
    check (schema_version between 1 and 1000),
  constraint sync_snapshots_count_range
    check (record_count between 0 and 40000),
  constraint sync_snapshots_device_id_shape
    check (char_length(device_id) between 8 and 64 and device_id = btrim(device_id)),
  constraint sync_snapshots_device_label_shape
    check (char_length(device_label) <= 24 and device_label !~ '[[:cntrl:]]')
);

create table if not exists app_private.sync_snapshot_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  payload text not null,
  encoding text not null,
  schema_version integer not null,
  byte_size integer not null,
  record_count integer not null,
  device_id text not null,
  device_label text not null default '',
  reason text not null default 'auto',
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, revision),
  constraint sync_versions_payload_size
    check (char_length(payload) between 2 and 4000000),
  constraint sync_versions_encoding_allowed
    check (encoding in ('gzip-base64', 'json')),
  constraint sync_versions_reason_allowed
    check (reason in ('auto', 'manual', 'pre-restore', 'pre-import', 'pre-clear'))
);

create index if not exists sync_snapshot_versions_recent_idx
  on app_private.sync_snapshot_versions (user_id, created_at desc);

alter table app_private.sync_snapshots enable row level security;
alter table app_private.sync_snapshots force row level security;
alter table app_private.sync_snapshot_versions enable row level security;
alter table app_private.sync_snapshot_versions force row level security;

revoke all on app_private.sync_snapshots from anon, authenticated;
revoke all on app_private.sync_snapshot_versions from anon, authenticated;

grant select, insert, update, delete on app_private.sync_snapshots to authenticated;
grant select, insert, delete on app_private.sync_snapshot_versions to authenticated;

drop policy if exists "sync snapshots are owned by the signed in user" on app_private.sync_snapshots;
create policy "sync snapshots are owned by the signed in user"
  on app_private.sync_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sync versions are owned by the signed in user" on app_private.sync_snapshot_versions;
create policy "sync versions are owned by the signed in user"
  on app_private.sync_snapshot_versions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 保存状況だけを返す軽量な問い合わせ。起動時の判定はこれだけを使う。
create or replace function public.get_my_backup_status()
returns table (
  revision bigint,
  updated_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  device_label text,
  record_count integer,
  byte_size integer,
  schema_version integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.revision,
    s.updated_at,
    s.client_updated_at,
    s.device_id,
    s.device_label,
    s.record_count,
    s.byte_size,
    s.schema_version
  from app_private.sync_snapshots s
  where s.user_id = (select auth.uid());
$$;

-- 世代の一覧。復元候補を選ばせるためのメタ情報だけを返す。
create or replace function public.list_my_backup_versions(p_limit integer default 30)
returns table (
  revision bigint,
  created_at timestamptz,
  client_updated_at timestamptz,
  device_label text,
  record_count integer,
  byte_size integer,
  reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.revision,
    v.created_at,
    v.client_updated_at,
    v.device_label,
    v.record_count,
    v.byte_size,
    v.reason
  from app_private.sync_snapshot_versions v
  where v.user_id = (select auth.uid())
  order by v.revision desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- 本体の取得。p_revision を指定すると、その世代を取り出す。
create or replace function public.pull_my_backup(p_revision bigint default null)
returns table (
  revision bigint,
  payload text,
  encoding text,
  schema_version integer,
  record_count integer,
  device_label text,
  client_updated_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.revision, s.payload, s.encoding, s.schema_version,
    s.record_count, s.device_label, s.client_updated_at, s.updated_at
  from app_private.sync_snapshots s
  where s.user_id = (select auth.uid())
    and p_revision is null
  union all
  select
    v.revision, v.payload, v.encoding, v.schema_version,
    v.record_count, v.device_label, v.client_updated_at, v.created_at
  from app_private.sync_snapshot_versions v
  where v.user_id = (select auth.uid())
    and p_revision is not null
    and v.revision = p_revision;
$$;

-- 世代の間引き。直近は密に、古いものは疎に残す。
create or replace function app_private.prune_backup_versions(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from app_private.sync_snapshot_versions v
  where v.user_id = p_user_id
    and v.revision not in (
      select keep.revision from (
        -- 直近5世代は無条件で残す
        (select v5.revision
           from app_private.sync_snapshot_versions v5
          where v5.user_id = p_user_id
          order by v5.revision desc
          limit 5)
        union
        -- 直近7日は1日1件
        (select distinct on (date_trunc('day', v7.created_at)) v7.revision
           from app_private.sync_snapshot_versions v7
          where v7.user_id = p_user_id
            and v7.created_at >= now() - interval '7 days'
          order by date_trunc('day', v7.created_at), v7.revision desc)
        union
        -- 8日以降は1週1件
        (select distinct on (date_trunc('week', vw.created_at)) vw.revision
           from app_private.sync_snapshot_versions vw
          where vw.user_id = p_user_id
            and vw.created_at < now() - interval '7 days'
          order by date_trunc('week', vw.created_at), vw.revision desc)
        union
        -- 利用者が明示的に作った復元ポイントは多めに残す
        (select vm.revision
           from app_private.sync_snapshot_versions vm
          where vm.user_id = p_user_id
            and vm.reason = 'manual'
          order by vm.revision desc
          limit 10)
      ) keep
    );
$$;

-- 送信。p_base_revision がサーバーの現在値と食い違う場合は書き込まず、
-- accepted = false と現在のサーバー状態を返す（競合）。
create or replace function public.push_my_backup(
  p_payload text,
  p_encoding text,
  p_schema_version integer,
  p_record_count integer,
  p_device_id text,
  p_device_label text,
  p_client_updated_at timestamptz,
  p_base_revision bigint,
  p_force boolean default false,
  p_reason text default 'auto'
)
returns table (
  accepted boolean,
  revision bigint,
  server_revision bigint,
  server_updated_at timestamptz,
  server_record_count integer,
  server_device_label text
)
language plpgsql
security invoker
set search_path = ''
as $$
-- 出力列 revision と表の列 revision が同名のため、あいまいな参照は列として解決する。
-- 変数は v_ / p_ を前置しており、この設定で意図が変わる箇所はない。
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_current app_private.sync_snapshots%rowtype;
  v_next_revision bigint;
  v_reason text := coalesce(p_reason, 'auto');
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_payload is null or char_length(p_payload) not between 2 and 4000000 then
    raise exception 'payload is outside the accepted size';
  end if;
  if coalesce(p_encoding, '') not in ('gzip-base64', 'json') then
    raise exception 'unsupported payload encoding';
  end if;
  if p_schema_version is null or p_schema_version not between 1 and 1000 then
    raise exception 'unsupported schema version';
  end if;
  if p_record_count is null or p_record_count not between 0 and 40000 then
    raise exception 'record count is outside the accepted range';
  end if;
  if p_device_id is null or char_length(btrim(p_device_id)) not between 8 and 64 then
    raise exception 'device id is invalid';
  end if;
  if v_reason not in ('auto', 'manual', 'pre-restore', 'pre-import', 'pre-clear') then
    raise exception 'unsupported reason';
  end if;

  select * into v_current
  from app_private.sync_snapshots s
  where s.user_id = v_user_id
  for update;

  if not found then
    insert into app_private.sync_snapshots (
      user_id, revision, payload, encoding, schema_version, byte_size,
      record_count, device_id, device_label, client_updated_at, updated_at
    ) values (
      v_user_id, 1, p_payload, p_encoding, p_schema_version, char_length(p_payload),
      p_record_count, btrim(p_device_id), left(coalesce(p_device_label, ''), 24),
      coalesce(p_client_updated_at, now()), now()
    );
    return query select true, 1::bigint, 1::bigint, now(), p_record_count, left(coalesce(p_device_label, ''), 24);
    return;
  end if;

  -- 同じ端末からの連続送信だけを軽く抑える。競合検出とは別の負荷対策。
  if v_current.device_id = btrim(p_device_id) and v_current.updated_at > now() - interval '3 seconds' then
    raise exception 'too many backup writes, please retry shortly';
  end if;

  if not coalesce(p_force, false) and coalesce(p_base_revision, -1) <> v_current.revision then
    return query select
      false,
      v_current.revision,
      v_current.revision,
      v_current.updated_at,
      v_current.record_count,
      v_current.device_label;
    return;
  end if;

  -- 置き換えられる内容は必ず世代表へ退避してから更新する。
  insert into app_private.sync_snapshot_versions (
    user_id, revision, payload, encoding, schema_version, byte_size,
    record_count, device_id, device_label, reason, client_updated_at, created_at
  ) values (
    v_current.user_id, v_current.revision, v_current.payload, v_current.encoding,
    v_current.schema_version, v_current.byte_size, v_current.record_count,
    v_current.device_id, v_current.device_label, v_reason,
    v_current.client_updated_at, v_current.updated_at
  )
  on conflict (user_id, revision) do nothing;

  v_next_revision := v_current.revision + 1;

  update app_private.sync_snapshots s
  set revision = v_next_revision,
      payload = p_payload,
      encoding = p_encoding,
      schema_version = p_schema_version,
      byte_size = char_length(p_payload),
      record_count = p_record_count,
      device_id = btrim(p_device_id),
      device_label = left(coalesce(p_device_label, ''), 24),
      client_updated_at = coalesce(p_client_updated_at, now()),
      updated_at = now()
  where s.user_id = v_user_id;

  perform app_private.prune_backup_versions(v_user_id);

  return query select true, v_next_revision, v_next_revision, now(), p_record_count, left(coalesce(p_device_label, ''), 24);
end;
$$;

-- 退会・利用停止のためのクラウド側全削除。端末内の記録は消さない。
create or replace function public.delete_my_backup()
returns void
language sql
security invoker
set search_path = ''
as $$
  with cleared_versions as (
    delete from app_private.sync_snapshot_versions where user_id = (select auth.uid())
  )
  delete from app_private.sync_snapshots where user_id = (select auth.uid());
$$;

revoke execute on function public.get_my_backup_status() from public, anon;
revoke execute on function public.list_my_backup_versions(integer) from public, anon;
revoke execute on function public.pull_my_backup(bigint) from public, anon;
revoke execute on function public.push_my_backup(text, text, integer, integer, text, text, timestamptz, bigint, boolean, text) from public, anon;
revoke execute on function public.delete_my_backup() from public, anon;
revoke execute on function app_private.prune_backup_versions(uuid) from public, anon;

grant execute on function public.get_my_backup_status() to authenticated;
grant execute on function public.list_my_backup_versions(integer) to authenticated;
grant execute on function public.pull_my_backup(bigint) to authenticated;
grant execute on function public.push_my_backup(text, text, integer, integer, text, text, timestamptz, bigint, boolean, text) to authenticated;
grant execute on function public.delete_my_backup() to authenticated;
grant execute on function app_private.prune_backup_versions(uuid) to authenticated;
