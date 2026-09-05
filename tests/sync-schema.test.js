"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// docs/sync-schema.sql を実際のPostgreSQL（WASM版）へ適用し、権限と挙動を確認する。
// 本番のSupabaseへ流す前にここで落ちれば、利用者のデータに触れずに気づける。
const SCHEMA_PATH = path.join(__dirname, "..", "docs", "sync-schema.sql");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

// Supabaseが最初から用意している前提のうち、このスキーマが依存する部分だけを再現する。
const SUPABASE_SHIM = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('okumeter.test_uid', true), '')::uuid
  $fn$;
  do $do$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $do$;
  grant usage on schema auth to anon, authenticated;
`;

async function createDatabase() {
  let PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    return null;
  }
  const db = new PGlite();
  await db.waitReady;
  await db.exec(SUPABASE_SHIM);
  await db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  await db.exec(`insert into auth.users(id) values ('${USER_A}'), ('${USER_B}') on conflict do nothing;`);
  return db;
}

async function asUser(db, userId, run) {
  await db.exec(`set role authenticated; select set_config('okumeter.test_uid', '${userId}', false);`);
  try {
    return await run();
  } finally {
    await db.exec("reset role;");
  }
}

function pushBackup(db, options) {
  return db.query(
    "select * from public.push_my_backup($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      options.payload,
      options.encoding || "json",
      2,
      options.count === undefined ? 1 : options.count,
      options.device || "device-aaaaaaaa",
      options.label || "iPhone",
      new Date().toISOString(),
      options.base === undefined ? 0 : options.base,
      options.force === true,
      options.reason || "auto",
    ]
  );
}

const database = createDatabase();
let skipReason = false;

test("同期スキーマは実際のPostgreSQLへ適用でき、繰り返し実行しても壊れない", async () => {
  const db = await database;
  if (!db) {
    skipReason = "@electric-sql/pglite が見つからないため検証を省略";
    return;
  }
  // 冪等であることは運用ガイドで約束しているため、2回目も通ることを確かめる。
  await db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

  const tables = await db.query(
    "select table_name from information_schema.tables where table_schema = 'app_private' order by table_name"
  );
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    "sync_snapshot_versions",
    "sync_snapshots",
  ]);
});

test("保存した内容を取り出せ、世代として残る", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  let result = await asUser(db, USER_A, () => pushBackup(db, { payload: '{"records":{"a":1}}', count: 5 }));
  assert.equal(result.rows[0].accepted, true);
  assert.equal(Number(result.rows[0].revision), 1);

  result = await asUser(db, USER_A, () => db.query("select * from public.pull_my_backup(null)"));
  assert.equal(result.rows[0].payload, '{"records":{"a":1}}');

  result = await asUser(db, USER_A, () => db.query("select * from public.get_my_backup_status()"));
  assert.equal(result.rows[0].record_count, 5);

  // 版数が一致していれば更新でき、置き換えられた内容は世代表へ退避される。
  result = await asUser(db, USER_A, () => pushBackup(db, {
    payload: '{"records":{"b":2}}', base: 1, count: 7, device: "device-bbbbbbbb",
  }));
  assert.equal(result.rows[0].accepted, true);
  assert.equal(Number(result.rows[0].revision), 2);

  const versions = await asUser(db, USER_A, () => db.query("select * from public.list_my_backup_versions(30)"));
  assert.equal(versions.rows.length, 1);
  assert.equal(Number(versions.rows[0].revision), 1);

  const old = await asUser(db, USER_A, () => db.query("select * from public.pull_my_backup(1)"));
  assert.equal(old.rows[0].payload, '{"records":{"a":1}}');
});

test("版数が食い違うときは書き込まず、現在のサーバー状態を返す", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  const before = await asUser(db, USER_A, () => db.query("select * from public.pull_my_backup(null)"));
  const result = await asUser(db, USER_A, () => pushBackup(db, {
    payload: '{"records":{"conflict":1}}', base: 99, device: "device-cccccccc",
  }));

  assert.equal(result.rows[0].accepted, false, "競合時に書き込んではいけない");
  assert.equal(Number(result.rows[0].server_revision), 2);

  const after = await asUser(db, USER_A, () => db.query("select * from public.pull_my_backup(null)"));
  assert.equal(after.rows[0].payload, before.rows[0].payload, "競合時に内容が変わってはいけない");
});

test("他人の記録は取得も直接参照もできない", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  const status = await asUser(db, USER_B, () => db.query("select * from public.get_my_backup_status()"));
  assert.equal(status.rows.length, 0);

  const payload = await asUser(db, USER_B, () => db.query("select * from public.pull_my_backup(null)"));
  assert.equal(payload.rows.length, 0);

  const versions = await asUser(db, USER_B, () => db.query("select * from public.list_my_backup_versions(30)"));
  assert.equal(versions.rows.length, 0);

  // RPCを通さずテーブルを直接読んでも、行レベルの制御で見えない。
  const direct = await asUser(db, USER_B, () => db.query("select count(*)::int as total from app_private.sync_snapshots"));
  assert.equal(direct.rows[0].total, 0);
});

test("未認証とanonロールは同期RPCを実行できない", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  await assert.rejects(
    () => asUser(db, "", () => pushBackup(db, { payload: '{"x":1}' })),
    /authentication required/
  );

  await assert.rejects(async () => {
    try {
      await db.exec(`set role anon; select set_config('okumeter.test_uid', '${USER_A}', false);`);
      await db.query("select * from public.get_my_backup_status()");
    } finally {
      await db.exec("reset role;");
    }
  }, /permission denied/i);
});

test("同じ端末からの連続送信だけを抑え、別端末は通す", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  const current = await asUser(db, USER_A, () => db.query("select * from public.get_my_backup_status()"));
  const revision = Number(current.rows[0].revision);

  await assert.rejects(
    () => asUser(db, USER_A, () => pushBackup(db, {
      payload: '{"records":{"c":3}}', base: revision, device: "device-bbbbbbbb",
    })),
    /too many backup writes/
  );

  const other = await asUser(db, USER_A, () => pushBackup(db, {
    payload: '{"records":{"d":4}}', base: revision, device: "device-dddddddd", label: "Windows PC",
  }));
  assert.equal(other.rows[0].accepted, true);
});

test("クラウド側の削除は本体と世代の両方を消す", async (t) => {
  const db = await database;
  if (!db) return t.skip(skipReason);

  await asUser(db, USER_A, () => db.query("select public.delete_my_backup()"));

  const status = await asUser(db, USER_A, () => db.query("select * from public.get_my_backup_status()"));
  const versions = await asUser(db, USER_A, () => db.query("select * from public.list_my_backup_versions(30)"));
  assert.equal(status.rows.length, 0);
  assert.equal(versions.rows.length, 0);

  await db.close();
});
