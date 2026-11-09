// 예시 데이터 비우기 마이그레이션(20261102010000) 확인: 갓 만든 DB는 잠기지 않고, 데이터가 있던 DB는 잠기며,
// hada_clear_example_copies가 사본 표만 비우고 hada_setup_flags·보안 표는 남기는지.
// PGLITE_MODULE=<@electric-sql/pglite 경로> node tests/example-clear-sql.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  const { PGlite } = await import(require('url').pathToFileURL(path.join(process.env.PGLITE_MODULE, 'dist/index.js')).href);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261102010000_example_clear.sql'), 'utf8');
  const prelude = `create role anon; create role authenticated; create role service_role;`;

  // 1) 갓 만든 Supabase: 사본 표가 비어 있으면 잠그지 않는다.
  const fresh = new PGlite();
  await fresh.exec(prelude + `create table attendance_records(id int); create table report_cache(id int);`);
  await fresh.exec(sql);
  assert.equal((await fresh.query(`select count(*)::int n from hada_setup_flags`)).rows[0].n, 0);

  // 2) 이미 쓰고 있는 학원: 출석 사본이 있으면 locked.
  const used = new PGlite();
  await used.exec(prelude + `create table attendance_records(id int); insert into attendance_records values (1);
    create table sync_queue(id int); insert into sync_queue values (1);
    create table hada_security_state(id int); insert into hada_security_state values (1);`);
  await used.exec(sql);
  assert.equal((await used.query(`select value->>'state' s from hada_setup_flags where key='example_clear'`)).rows[0].s, 'locked');

  // 3) 사본 비우기: 사본 표는 비우고 보안 표·플래그는 남긴다. 없는 표는 건너뛴다.
  await used.exec(`select public.hada_clear_example_copies()`);
  for (const t of ['attendance_records', 'sync_queue']) {
    assert.equal((await used.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, t);
  }
  assert.equal((await used.query(`select count(*)::int n from hada_security_state`)).rows[0].n, 1);
  assert.equal((await used.query(`select count(*)::int n from hada_setup_flags`)).rows[0].n, 1);

  // 4) 다시 실행해도 잠금이 바뀌지 않는다.
  await used.exec(sql);
  assert.equal((await used.query(`select count(*)::int n from hada_setup_flags`)).rows[0].n, 1);
  console.log('example-clear-sql: ok');
})().catch((e) => { console.error(e); process.exit(1); });
