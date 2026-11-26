// Database behaviour tests: runs every migration in an in-memory Postgres (PGlite) with a
// minimal stand-in for Supabase auth, then checks permissions, cutoffs, balances and month closing.
// Usage: pnpm test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const mig = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n')
  .replace(/create extension if not exists pgcrypto;/, '')
  .replace(/create extension if not exists pg_cron[^;]*;/, '')
  .replace(/create extension if not exists pg_net[^;]*;/, '');
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to public;
  create schema cron; create function cron.schedule(a text, b text, c text) returns int language sql as $$ select 1 $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated, anon; grant select, insert, update, delete on storage.objects to authenticated;
  create schema net; create function net.http_post(url text, body jsonb default null, params jsonb default null, headers jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $$ select 1::bigint $$;
`);
// like Supabase: new tables in public are granted to the API roles by default, so a
// migration's own revokes (e.g. on profiles columns) are what decide access
await db.exec(`grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
await db.exec(mig);

const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', C='00000000-0000-0000-0000-00000000000c';
const S='00000000-0000-0000-0000-00000000000f', D='00000000-0000-0000-0000-00000000000d';
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${A}','{"full_name":"Sakib"}'),('${B}','{"full_name":"Karim"}'),('${C}','{"full_name":"Out"}'),('${S}','{"full_name":"Boss"}');
  insert into auth.users values ('${D}','{"full_name":"Temp"}','{"must_change_password":true,"username":"temp.user"}')`);
await db.exec(`update profiles set is_super_admin = true where id = '${S}'`);

let pass=0, fail=0;
const as = async (uid, sql, params=[]) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const asRole = async (role, uid, sql, params=[]) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const ok = (name, cond, extra='') => { if (cond) pass++; else fail++; console.log(`${cond?'PASS':'FAIL'} ${name} ${extra}`); };
const throws = async (name, fn, code) => { try { await fn(); ok(name, false, '(no error)'); } catch(e){ ok(name, !code || e.message.includes(code), e.message); } };

// ---- super admin, requests, approvals
await throws('users cannot create_mess directly', () => as(A, `select public.create_mess('X')`), 'permission denied');
await throws('users cannot admin_create_mess', () => as(A, `select public.admin_create_mess('X', null, $1)`, [A]), 'FORBIDDEN');
const req = (await as(A, `select public.request_mess('Green Mess', 'Mirpur') id`)).rows[0].id;
await throws('one pending mess request', () => as(A, `select public.request_mess('Again')`), 'ALREADY_REQUESTED');
ok('A has no mess while pending', (await as(A, `select count(*)::int n from messes`)).rows[0].n === 0);
await throws('A cannot approve own request', () => as(A, `select review_mess_request($1, true)`, [req]), 'FORBIDDEN');
ok('super admin sees request', (await as(S, `select count(*)::int n from mess_requests where status='pending'`)).rows[0].n === 1);
const mess = (await as(S, `select review_mess_request($1, true) id`, [req])).rows[0].id;
ok('approved → A is manager', (await as(A, `select role from mess_members where user_id=$1`, [A])).rows[0]?.role === 'manager');
const code = (await as(A, `select invite_code from messes`)).rows[0].invite_code;
ok('invite code → join request', (await as(B, `select public.join_mess($1) m`, [code.toLowerCase()])).rows[0].m === null);
ok('B not a member while pending', (await as(B, `select count(*)::int n from mess_members`)).rows[0].n === 0);
await throws('duplicate join request', () => as(B, `select public.join_mess($1)`, [code]), 'ALREADY_REQUESTED');
const jr = (await as(A, `select id from join_requests where status='pending'`)).rows[0]?.id;
ok('manager sees join request', !!jr);
ok('manager sees requester profile', (await as(A, `select full_name from profiles where id=$1`, [B])).rows[0]?.full_name === 'Karim');
await throws('requester cannot self-approve', () => as(B, `select review_join_request($1, true)`, [jr]), 'FORBIDDEN');
await as(A, `select review_join_request($1, true)`, [jr]);
ok('B joined', (await as(B, `select count(*)::int n from mess_members`)).rows[0].n === 2);
await throws('profile flags are protected', () => as(B, `update profiles set is_super_admin = true where id = $1`, [B]), 'permission denied');
await as(B, `update profiles set locale = 'en' where id = $1`, [B]);
ok('profile locale still editable', (await as(B, `select locale from profiles where id=$1`, [B])).rows[0].locale === 'en');
ok('temp account flagged', (await as(D, `select must_change_password m, username u from profiles where id=$1`, [D])).rows[0].m === true);
await as(D, `select password_changed()`);
ok('password_changed clears flag', (await as(D, `select must_change_password m from profiles where id=$1`, [D])).rows[0].m === false);
ok('super admin sees all messes', (await as(S, `select count(*)::int n from messes`)).rows[0].n === 1);
ok('platform stats', (await as(S, `select platform_stats() s`)).rows[0].s.messes === 1);
await throws('stats are super-admin only', () => as(A, `select platform_stats()`), 'FORBIDDEN');
ok('C sees nothing', (await as(C, `select count(*)::int n from messes`)).rows[0].n === 0);
await throws('B cannot add member', () => as(B, `insert into mess_members(mess_id, display_name) values ($1,'X')`, [mess]), 'row-level security');
await as(A, `insert into mess_members(mess_id, display_name) values ($1,'Rahim')`, [mess]);
await as(A, `update mess_members set joined_on = date_trunc('month', today_dhaka())::date where mess_id=$1`, [mess]);
const gen = (await as(B, `select public.ensure_meals($1) n`, [mess])).rows[0].n;
const days = (await db.query(`select extract(day from today_dhaka())::int d`)).rows[0].d;
ok('ensure_meals backfill', gen === days*3, `${gen} rows for ${days} days x3`);
ok('ensure_meals idempotent', (await as(B, `select public.ensure_meals($1) n`, [mess])).rows[0].n === 0);
await throws('generate_daily_meals not callable by users', () => as(A, `select generate_daily_meals()`), 'permission denied');

const ids = Object.fromEntries((await as(A, `select display_name, id from mess_members`)).rows.map(r=>[r.display_name, r.id]));
await as(B, `select set_meal($1, today_dhaka()+1, p_lunch=>false)`, [ids.Karim]);
ok('B turned off own lunch tomorrow', (await as(B, `select lunch from meals where member_id=$1 and date=today_dhaka()+1`, [ids.Karim])).rows[0].lunch === false);
await throws('B cannot edit Rahim', () => as(B, `select set_meal($1, today_dhaka()+1, p_lunch=>false)`, [ids.Rahim]), 'FORBIDDEN');
await throws('B cutoff yesterday', () => as(B, `select set_meal($1, today_dhaka()-1, p_dinner=>false)`, [ids.Karim]), 'CUTOFF_PASSED');
await as(A, `select set_meal($1, today_dhaka()-1, p_guest_dinner=>2)`, [ids.Rahim]);
await throws('direct meal update blocked', async () => { const r = await as(B, `update meals set lunch=false where member_id=$1 returning id`, [ids.Karim]); if (!r.rows.length) throw new Error('blocked-by-rls'); }, 'blocked');
await throws('breakfast disabled', () => as(A, `select set_meal($1, today_dhaka(), p_breakfast=>true)`, [ids.Rahim]), 'BREAKFAST_DISABLED');

await as(A, `insert into bazar_entries(mess_id, amount, shopper_id) values ($1, 3000, $2), ($1, 1500.50, $3)`, [mess, ids.Karim, ids.Sakib]);
await throws('B cannot add bazar', () => as(B, `insert into bazar_entries(mess_id, amount) values ($1, 10)`, [mess]), 'row-level security');

await as(B, `insert into deposits(mess_id, member_id, amount, method, txn_id, created_by) values ($1,$2,2000,'bkash','TX1',$3)`, [mess, ids.Karim, B]);
await throws('B cannot self-approve', () => as(B, `insert into deposits(mess_id, member_id, amount, status) values ($1,$2,9999,'approved')`, [mess, ids.Karim]), 'row-level security');
await throws('B cannot deposit for Rahim', () => as(B, `insert into deposits(mess_id, member_id, amount) values ($1,$2,5)`, [mess, ids.Rahim]), 'row-level security');
await as(A, `update deposits set status='approved', reviewed_by=$1 where mess_id=$2`, [A, mess]);
await as(A, `insert into deposits(mess_id, member_id, amount, status) values ($1,$2,1000,'approved')`, [mess, ids.Rahim]);

await as(A, `select add_fixed_cost($1, today_dhaka(), 'wifi', 'WiFi', 1000)`, [mess]);
const shares = (await as(A, `select amount from fixed_cost_shares order by amount desc`)).rows.map(r=>Number(r.amount));
ok('equal split sums', Math.abs(shares.reduce((a,b)=>a+b,0)-1000)<1e-9, JSON.stringify(shares));
await throws('custom split mismatch', () => as(A, `select add_fixed_cost($1, today_dhaka(), 'rent', 'Rent', 500, 'custom', $2)`, [mess, JSON.stringify([{member_id: ids.Karim, amount: 400}])]), 'SHARES_MISMATCH');
await throws('B cannot add fixed cost', () => as(B, `select add_fixed_cost($1, today_dhaka(), 'gas', 'Gas', 100)`, [mess]), 'FORBIDDEN');

const sum = (await as(B, `select month_summary($1, today_dhaka()) s`, [mess])).rows[0].s;

const totalMeals = sum.members.reduce((a,m)=>a+Number(m.meals),0);
ok('member meals add up', Math.abs(totalMeals - Number(sum.total_meals))<1e-9);
const mealCost = sum.members.reduce((a,m)=>a+Number(m.meal_cost),0);
ok('meal cost ≈ bazar', Math.abs(mealCost - 4500.5) < 0.05, mealCost);
const bal = sum.members.reduce((a,m)=>a+Number(m.balance),0);
ok('balances = deposits - bazar - fixed', Math.abs(bal - (3000 - 4500.5 - 1000)) < 0.05, bal);

await throws('B cannot close', () => as(B, `select close_month($1, today_dhaka())`, [mess]), 'FORBIDDEN');
const closed = (await as(A, `select close_month($1, today_dhaka()) s`, [mess])).rows[0].s;
ok('closed status', closed.status === 'closed');
await throws('bazar locked', () => as(A, `insert into bazar_entries(mess_id, amount) values ($1, 10)`, [mess]), 'MONTH_CLOSED');
await throws('meal locked', () => as(A, `select set_meal($1, today_dhaka()-1, p_lunch=>false)`, [ids.Rahim]), 'MONTH_CLOSED');
const next = (await as(A, `select month_summary($1, (date_trunc('month', today_dhaka()) + interval '1 month')::date) s`, [mess])).rows[0].s;
const carry = next.members.reduce((a,m)=>a+Number(m.carry_in),0);
ok('carry forward', Math.abs(carry - bal) < 0.01, carry);
await as(A, `select reopen_month($1, today_dhaka())`, [mess]);
await as(A, `insert into bazar_entries(mess_id, amount) values ($1, 10)`, [mess]);
ok('reopened accepts edits', true);
ok('audit rows exist', (await as(B, `select count(*)::int n from audit_log`)).rows[0].n > 5);

await as(C, `select join_mess($1) m`, [(await as(A,`select claim_code from mess_members where id=$1`,[ids.Rahim])).rows[0].claim_code]);
ok('claim code links Rahim to C', (await as(C, `select display_name from mess_members where user_id=$1`, [C])).rows[0]?.display_name === 'Rahim');

// ---- roster
const order = [ids.Karim, ids.Rahim, ids.Sakib];
const arr = `{${order.join(',')}}`;
await throws('B cannot generate roster', () => as(B, `select generate_roster($1, $2, today_dhaka(), today_dhaka()+5)`, [mess, arr]), 'FORBIDDEN');
const made = (await as(A, `select generate_roster($1, $2, today_dhaka(), today_dhaka()+5) n`, [mess, arr])).rows[0].n;
ok('roster generated', made === 6, made);
const duty = async (offset) => (await as(A, `select id, member_id from bazar_roster where date = today_dhaka() + $1::int`, [offset])).rows[0];
ok('rotation order', (await duty(0)).member_id === ids.Karim && (await duty(1)).member_id === ids.Rahim && (await duty(3)).member_id === ids.Karim);
await throws('B cannot swap others', async () => as(B, `select swap_duty($1, $2)`, [(await duty(1)).id, (await duty(2)).id]), 'FORBIDDEN');
await as(B, `select swap_duty($1, $2)`, [(await duty(3)).id, (await duty(1)).id]);
ok('B swapped own duty', (await duty(1)).member_id === ids.Karim && (await duty(3)).member_id === ids.Rahim);
await throws('B cannot edit roster directly', async () => { const r = await as(B, `update bazar_roster set done = true returning id`); if (!r.rows.length) throw new Error('blocked-by-rls'); }, 'blocked');
const regen = (await as(A, `select generate_roster($1, $2, today_dhaka(), today_dhaka()+1, 1, 2) n`, [mess, arr])).rows[0].n;
ok('two people per turn', regen === 4 && (await as(A, `select count(*)::int n from bazar_roster where date = today_dhaka()`)).rows[0].n === 2);
await as(A, `insert into bazar_entries(mess_id, amount, shopper_id) values ($1, 500, $2)`, [mess, ids.Karim]);
ok('bazar marks duty done', (await as(A, `select done from bazar_roster where date = today_dhaka() and member_id = $1`, [ids.Karim])).rows[0]?.done === true);

// ---- custom roles
const role = (await as(A, `insert into mess_roles(mess_id, name, permissions) values ($1, 'Bazar team', '{bazar,notices}') returning id`, [mess])).rows[0].id;
await throws('member cannot create roles', () => as(B, `insert into mess_roles(mess_id, name) values ($1, 'X')`, [mess]), 'row-level security');
await throws('invalid permission rejected', () => as(A, `insert into mess_roles(mess_id, name, permissions) values ($1, 'Bad', '{root}')`, [mess]), 'check constraint');
await as(A, `update mess_members set role_id = $1 where id = $2`, [role, ids.Karim]);
ok('B now has bazar permission', (await as(B, `select my_permissions($1) p`, [mess])).rows[0].p.join() === 'bazar,notices');
await as(B, `insert into bazar_entries(mess_id, amount) values ($1, 20)`, [mess]);
ok('B adds bazar via role', true);
await throws('role does not grant deposits', () => as(B, `insert into deposits(mess_id, member_id, amount, status) values ($1,$2,5,'approved')`, [mess, ids.Rahim]), 'row-level security');
await as(A, `update mess_roles set permissions = '{bazar,members}' where id = $1`, [role]);
await throws('members-permission cannot change roles', () => as(B, `update mess_members set role = 'manager' where id = $1`, [ids.Karim]), 'FORBIDDEN');
await as(B, `update mess_members set room = '4B' where id = $1`, [ids.Rahim]);
ok('members-permission edits members', (await as(A, `select room from mess_members where id=$1`, [ids.Rahim])).rows[0].room === '4B');
await as(A, `delete from mess_roles where id = $1`, [role]);
ok('deleting role removes access', (await as(B, `select my_permissions($1) p`, [mess])).rows[0].p.length === 0);

// ---- bill shares for a member joining mid-month
const fcMess = (await as(S, `select admin_create_mess('Bill Mess', null, $1) id`, [A])).rows[0].id;
const add = async (n) => (await as(A, `insert into mess_members(mess_id, display_name) values ($1, $2) returning id`, [fcMess, n])).rows[0].id;
const p1 = (await as(A, `select id from mess_members where mess_id=$1`, [fcMess])).rows[0].id, p2 = await add('P2'), p3 = await add('P3');
const rent = (await as(A, `select add_fixed_cost($1, today_dhaka(), 'rent', 'Rent', 9000) id`, [fcMess])).rows[0].id;
const bua = (await as(A, `select add_fixed_cost($1, today_dhaka(), 'cook', 'Bua', 3000) id`, [fcMess])).rows[0].id;
const nw = await add('Newcomer');
const shareOf = async (cost, m) => Number((await as(A, `select coalesce((select amount from fixed_cost_shares where fixed_cost_id=$1 and member_id=$2),0) a`, [cost, m])).rows[0].a);
const total = async (cost) => Number((await as(A, `select sum(amount) s from fixed_cost_shares where fixed_cost_id=$1`, [cost])).rows[0].s);
ok('newcomer not on existing bills', (await shareOf(rent, nw)) === 0 && (await shareOf(bua, nw)) === 0);
await as(A, `select set_bill_share($1, $2, 'equal')`, [bua, nw]);
ok('equal: bua 3000 → 750 each for 4', (await shareOf(bua, nw)) === 750 && (await shareOf(bua, p1)) === 750 && (await total(bua)) === 3000);
await as(A, `select set_bill_share($1, $2, 'amount', 1500)`, [rent, nw]);
ok('amount: newcomer pays 1500 rent, others 2500 each, total kept', (await shareOf(rent, nw)) === 1500 && (await shareOf(rent, p2)) === 2500 && (await total(rent)) === 9000);
ok('split label becomes custom', (await as(A, `select split_type t from fixed_costs where id=$1`, [rent])).rows[0].t === 'custom');
await as(A, `select set_bill_share($1, $2, 'none')`, [rent, nw]);
ok('none: removed again, others back to 3000', (await shareOf(rent, nw)) === 0 && (await shareOf(rent, p3)) === 3000 && (await total(rent)) === 9000);
ok('label back to equal', (await as(A, `select split_type t from fixed_costs where id=$1`, [rent])).rows[0].t === 'equal');
const odd = (await as(A, `select add_fixed_cost($1, today_dhaka(), 'gas', 'Gas', 1000) id`, [fcMess])).rows[0].id;
await as(A, `select set_bill_share($1, $2, 'amount', 333.33)`, [odd, nw]);
ok('rounding: shares still sum to exactly 1000', (await total(odd)) === 1000);
await throws('member without costs permission blocked', () => as(B, `select set_bill_share($1, $2, 'none')`, [odd, nw]), 'FORBIDDEN');
await throws('amount above the bill rejected', () => as(A, `select set_bill_share($1, $2, 'amount', 5000)`, [odd, nw]), 'INVALID_INPUT');
const billSum = (await as(A, `select month_summary($1, today_dhaka()) s`, [fcMess])).rows[0].s;
const nwRow = billSum.members.find((m) => m.display_name === 'Newcomer');
ok('summary bills newcomer only for chosen bills', Math.abs(Number(nwRow.fixed_share) - (750 + 333.33)) < 0.01, nwRow.fixed_share);

// ---- weekly bazar duty
const wk = fcMess; // reuse the bill-test mess: members p1, p2, p3, nw
const dowOf = async (d) => (await db.query(`select extract(dow from $1::date)::int w`, [d])).rows[0].w;
const sat = 6, tue = 2;
const wkMade = (await as(A, `select save_weekly_duty($1, $2) n`, [wk, JSON.stringify([{ weekday: sat, member_id: p2 }, { weekday: tue, member_id: p3 }])])).rows[0].n;
const wrows = (await as(A, `select date::text d, member_id m from bazar_roster where mess_id=$1 order by date`, [wk])).rows;
ok('weekly: 4 weeks of Saturdays + Tuesdays created', wkMade === wrows.length && wkMade >= 7 && wkMade <= 9, `${wkMade}`);
let right = true;
for (const r of wrows) { const w = await dowOf(r.d); if (!((w === sat && r.m === p2) || (w === tue && r.m === p3))) right = false; }
ok('weekly: Saturday = P2, Tuesday = P3 every week', right);
await throws('weekly: members without roster permission blocked', () => as(B, `select save_weekly_duty($1, '[]')`, [wk]), 'FORBIDDEN');
ok('weekly: plan visible to members', (await as(A, `select count(*)::int n from weekly_duty where mess_id=$1`, [wk])).rows[0].n === 2);
// a swapped/deleted duty is not put back by the next fill
const firstSat = wrows.find((r) => r.m === p2);
await as(A, `delete from bazar_roster where mess_id=$1 and date=$2`, [wk, firstSat.d]);
ok('weekly: refill does not re-add a removed duty', (await as(A, `select ensure_weekly_duty($1) n`, [wk])).rows[0].n === 0
  && (await as(A, `select count(*)::int n from bazar_roster where mess_id=$1 and date=$2`, [wk, firstSat.d])).rows[0].n === 0);
// keeps going: pretend the filled date is in the past → next call adds the following weeks
await db.query(`delete from bazar_roster where mess_id = $1 and date > today_dhaka() + 13`, [wk]);
await db.query(`update messes set weekly_filled_until = today_dhaka() + 13 where id = $1`, [wk]);
ok('weekly: extends automatically as weeks pass', (await as(A, `select ensure_weekly_duty($1) n`, [wk])).rows[0].n >= 3);
// change the plan: Saturday → nw; old not-done Saturday duties are rebuilt
await as(A, `select save_weekly_duty($1, $2)`, [wk, JSON.stringify([{ weekday: sat, member_id: nw }])]);
const after = (await as(A, `select date::text d, member_id m from bazar_roster where mess_id=$1 and date >= today_dhaka()`, [wk])).rows;
let sats = true, noTue = true;
for (const r of after) { const w = await dowOf(r.d); if (w === sat && r.m !== nw) sats = false; if (w === tue) noTue = false; }
ok('weekly: new plan replaces old (Saturdays → Newcomer, Tuesdays cleared)', sats && noTue && after.length >= 4);
await as(A, `select save_weekly_duty($1, '[]')`, [wk]);
ok('weekly: empty plan clears future duties', (await as(A, `select count(*)::int n from bazar_roster where mess_id=$1 and date >= today_dhaka() and not done`, [wk])).rows[0].n === 0);

// ---- half meals
const hm = fcMess, hmDay = (await db.query(`select (date_trunc('month', today_dhaka()))::date::text d`)).rows[0].d;
await as(A, `update mess_members set joined_on = $2 where mess_id = $1`, [hm, hmDay]);
await as(A, `select set_meal($1, $2, p_lunch => true, p_dinner => false)`, [p2, hmDay]);
const base = (await as(A, `select month_summary($1, today_dhaka()) s`, [hm])).rows[0].s;
await as(A, `select set_meal_half($1, $2, 'lunch', true)`, [p2, hmDay]);
const half = (await as(A, `select month_summary($1, today_dhaka()) s`, [hm])).rows[0].s;
ok('half meal counts 0.5', Math.abs(Number(base.total_meals) - Number(half.total_meals) - 0.5) < 1e-9, `${base.total_meals} → ${half.total_meals}`);
const p2row = half.members.find((x) => x.member_id === p2), p2base = base.members.find((x) => x.member_id === p2);
ok('member meal count drops by 0.5', Math.abs(Number(p2base.meals) - Number(p2row.meals) - 0.5) < 1e-9);
await as(A, `select set_meal_half($1, $2, 'dinner', true)`, [p3, hmDay]);
ok('half on an off meal turns it on (counts 0.5)', (await as(A, `select dinner, half_dinner from meals where member_id=$1 and date=$2`, [p3, hmDay])).rows[0].half_dinner === true);
await as(A, `select set_meal_half($1, $2, 'lunch', false)`, [p2, hmDay]);
const back = (await as(A, `select month_summary($1, today_dhaka()) s`, [hm])).rows[0].s.members.find((x) => x.member_id === p2);
ok('half off → full again', Math.abs(Number(back.meals) - Number(p2base.meals)) < 1e-9, `${back.meals}`);
await throws('member blocked from others\' half meal', () => as(B, `select set_meal_half($1, $2, 'lunch', true)`, [p2, hmDay]), 'FORBIDDEN');
await throws('bad meal kind rejected', () => as(A, `select set_meal_half($1, $2, 'snack', true)`, [p2, hmDay]), 'INVALID_INPUT');

// ---- profile pictures
await as(B, `insert into storage.objects(bucket_id, name) values ('avatars', $1)`, [`${B}/me.webp`]);
ok('avatar: upload into own folder', (await as(B, `select count(*)::int n from storage.objects where name like $1`, [`${B}/%`])).rows[0].n === 1);
await throws('avatar: cannot upload into someone else\'s folder', () => as(B, `insert into storage.objects(bucket_id, name) values ('avatars', $1)`, [`${A}/x.webp`]), 'row-level security');
await as(B, `update profiles set avatar_url = 'https://x/avatars/b.webp' where id = $1`, [B]);
ok('avatar: user can set own avatar_url', (await as(B, `select avatar_url from profiles where id=$1`, [B])).rows[0].avatar_url === 'https://x/avatars/b.webp');

// ---- settings: rounding, defaults for join approvals, repeating bills, inbox
{
  const rm = (await as(S, `select admin_create_mess('Settings Mess', null, $1) id`, [A])).rows[0].id;
  await as(A, `insert into mess_members(mess_id, display_name, joined_on) values ($1,'Y', date_trunc('month', today_dhaka())::date)`, [rm]);
  await as(A, `update mess_members set joined_on = date_trunc('month', today_dhaka())::date where mess_id = $1`, [rm]);
  await as(A, `select ensure_meals($1)`, [rm]);
  await as(A, `insert into bazar_entries(mess_id, amount) values ($1, 1000)`, [rm]);
  const exact = (await as(A, `select month_summary($1, today_dhaka()) s`, [rm])).rows[0].s;
  await as(A, `update messes set meal_rate_rounding = 'sheet' where id = $1`, [rm]);
  const sheet = (await as(A, `select month_summary($1, today_dhaka()) s`, [rm])).rows[0].s;
  const m0 = sheet.members[0];
  ok('rounding: sheet mode uses the 2-decimal rate for meal cost', Math.abs(Number(m0.meal_cost) - Math.round(Number(m0.meals) * Number(sheet.meal_rate) * 100) / 100) < 1e-9, `${exact.members[0].meal_cost} → ${m0.meal_cost}`);
  await throws('settings: warning days outside 2-5 rejected', () => as(A, `update messes set low_meal_days = 9 where id = $1`, [rm]), 'check constraint');
  await as(A, `update messes set new_member_lunch = false where id = $1`, [rm]);
  const code = (await as(A, `select invite_code from messes where id=$1`, [rm])).rows[0].invite_code;
  await as(C, `select join_mess($1)`, [code]);
  const jr = (await as(A, `select id from join_requests where mess_id=$1 and status='pending'`, [rm])).rows[0].id;
  await as(A, `select review_join_request($1, true)`, [jr]);
  ok('join approval uses the mess default meals', (await as(A, `select default_lunch l, default_dinner d from mess_members where mess_id=$1 and user_id=$2`, [rm, C])).rows[0].l === false);
  // repeating bill: put one in last month, then roll forward
  const prev = (await db.query(`select (date_trunc('month', today_dhaka()) - interval '1 month')::date::text d`)).rows[0].d;
  await as(A, `update mess_members set joined_on = $2 where mess_id = $1`, [rm, prev]);
  await as(A, `select add_fixed_cost($1, $2::date, 'rent', 'Rent', 900)`, [rm, prev]);
  await as(A, `update fixed_costs set repeat_monthly = true where mess_id = $1 and month = $2`, [rm, prev]);
  ok('repeat: copied once into this month', (await as(A, `select ensure_recurring_bills($1) n`, [rm])).rows[0].n === 1 && (await as(A, `select ensure_recurring_bills($1) n`, [rm])).rows[0].n === 0);
  const now = (await as(A, `select f.amount, f.repeat_monthly r, (select sum(amount) from fixed_cost_shares where fixed_cost_id=f.id) s, (select count(*) from fixed_cost_shares where fixed_cost_id=f.id)::int n from fixed_costs f where mess_id=$1 and month = date_trunc('month', today_dhaka())::date`, [rm])).rows[0];
  ok('repeat: equal bill re-split among this month\'s members (3), keeps repeating', Number(now.amount) === 900 && Number(now.s) === 900 && now.n === 3 && now.r === true, JSON.stringify(now));
  await throws('repeat: members without costs permission cannot toggle', async () => { const r = await as(C, `update fixed_costs set repeat_monthly = false where mess_id = $1 returning id`, [rm]); if (!r.rows.length) throw new Error('blocked-by-rls'); }, 'blocked');
  await db.query(`insert into notifications(user_id, title) values ($1, 'hi'), ($2, 'other')`, [B, A]);
  ok('inbox: each person sees only their own notifications', (await as(B, `select count(*)::int n from notifications`)).rows[0].n === 1);
  await as(B, `update notifications set read_at = now()`);
  ok('inbox: can mark own as read', (await as(B, `select count(*)::int n from notifications where read_at is not null`)).rows[0].n === 1);
}

// ---- cook (khala) login + daily menu
{
  const K = '00000000-0000-0000-0000-0000000000c0', E = '00000000-0000-0000-0000-0000000000e0';
  await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${K}','{"full_name":"Khala"}'),('${E}','{"full_name":"Stranger"}')`);
  await db.query(`insert into mess_cooks (mess_id, user_id, name) values ($1, $2, 'Khala')`, [mess, K]);
  const mgr = (await db.query(`select user_id from mess_members where mess_id=$1 and role='manager' and user_id is not null limit 1`, [mess])).rows[0].user_id;
  const member = (await db.query(`select user_id from mess_members where mess_id=$1 and role='member' and user_id is not null limit 1`, [mess])).rows[0].user_id;
  const want = (await db.query(`select coalesce(sum(case when lunch then (case when half_lunch then 0.5 else 1 end) else 0 end + guest_lunch),0)::float n
    from meals ml join mess_members mm on mm.id = ml.member_id
    where ml.mess_id=$1 and ml.date = today_dhaka() and mm.joined_on <= today_dhaka() and (mm.left_on is null or mm.left_on >= today_dhaka())`, [mess])).rows[0].n;
  const k = (await as(K, `select kitchen_day($1) k`, [mess])).rows[0].k;
  ok('cook: kitchen_day lunch count matches the meals', Number(k.lunch) === want, `${k.lunch} vs ${want}`);
  ok('cook: sees no member rows, meals, deposits or summary', (await as(K, `select (select count(*) from mess_members)+(select count(*) from meals)+(select count(*) from deposits) n`)).rows[0].n == 0);
  await throws('cook: cannot read the money summary', () => as(K, `select month_summary($1, today_dhaka())`, [mess]), 'FORBIDDEN');
  await throws('stranger: cannot read kitchen numbers', () => as(E, `select kitchen_day($1)`, [mess]), 'FORBIDDEN');
  await as(mgr, `insert into meal_menus (mess_id, date, lunch, dinner) values ($1, today_dhaka(), 'Rice, chicken, dal', 'Rice, fish')`, [mess]);
  ok('menu: cook sees the manager\'s menu', (await as(K, `select kitchen_day($1) k`, [mess])).rows[0].k.menu.lunch === 'Rice, chicken, dal');
  await as(mgr, `update meal_menus set note = 'আজ ৫ জন বেশি, ভাত বেশি রাঁধবেন' where mess_id = $1 and date = today_dhaka()`, [mess]);
  ok('menu: cook sees the manager\'s message', (await as(K, `select kitchen_day($1) k`, [mess])).rows[0].k.menu.note === 'আজ ৫ জন বেশি, ভাত বেশি রাঁধবেন');
  ok('menu: members can read it', (await as(member, `select count(*)::int n from meal_menus where mess_id=$1`, [mess])).rows[0].n === 1);
  await throws('menu: members cannot write it', () => as(member, `insert into meal_menus (mess_id, date, lunch) values ($1, today_dhaka() + 1, 'x')`, [mess]), 'row-level security');
  await throws('menu: cook cannot write it', () => as(K, `insert into meal_menus (mess_id, date, lunch) values ($1, today_dhaka() + 1, 'x')`, [mess]), 'row-level security');
  ok('cooks list: manager sees it, members do not', (await as(mgr, `select count(*)::int n from mess_cooks`)).rows[0].n === 1 && (await as(member, `select count(*)::int n from mess_cooks`)).rows[0].n === 0);

  // ---- khala's leave (tomorrow, so no cutoff gets in the way)
  const tmr = (await db.query(`select (today_dhaka() + 1)::text d`)).rows[0].d;
  const myId = (await db.query(`select id from mess_members where mess_id=$1 and user_id=$2`, [mess, member])).rows[0].id;
  await throws('leave: members cannot mark it', () => as(member, `select set_cook_leave($1, $2::date, $2::date, array['lunch'])`, [mess, tmr]), 'FORBIDDEN');
  await as(mgr, `update mess_members set default_lunch = true, default_dinner = true where mess_id = $1`, [mess]);
  ok('leave: manager marks lunch', (await as(mgr, `select set_cook_leave($1, $2::date, $2::date, array['lunch']) n`, [mess, tmr])).rows[0].n === 1);
  const lunchOn = async () => (await db.query(`select count(*) filter (where lunch)::int l, count(*) filter (where dinner)::int d, count(*)::int n from meals where mess_id=$1 and date=$2`, [mess, tmr])).rows[0];
  let st = await lunchOn();
  ok('leave: lunch off for everyone, dinner untouched', st.l === 0 && st.d === st.n && st.n >= 2, JSON.stringify(st));
  ok('leave: cook sees it on the kitchen page', (await as(K, `select kitchen_day($1, $2::date) k`, [mess, tmr])).rows[0].k.leave.lunch === true);
  await throws('leave: member cannot turn lunch back on', () => as(member, `select set_meal($1, $2::date, p_lunch => true)`, [myId, tmr]), 'COOK_LEAVE');
  await throws('leave: member cannot add a lunch guest', () => as(member, `select set_meal($1, $2::date, p_guest_lunch => 1)`, [myId, tmr]), 'COOK_LEAVE');
  await as(member, `select set_meal($1, $2::date, p_dinner => false)`, [myId, tmr]);
  ok('leave: other meals still change normally', (await db.query(`select dinner from meals where member_id=$1 and date=$2`, [myId, tmr])).rows[0].dinner === false);
  const leaveId = (await db.query(`select id from cook_leaves where mess_id=$1 and date=$2`, [mess, tmr])).rows[0].id;
  const vol = (await as(member, `select volunteer_to_cook($1) id`, [leaveId])).rows[0].id;
  await throws('leave: member cannot approve themselves', () => as(member, `select review_cook_volunteer($1, true)`, [vol]), 'FORBIDDEN');
  await as(mgr, `select review_cook_volunteer($1, true)`, [vol]);
  ok('leave: approved cook gets their lunch on', (await db.query(`select lunch from meals where member_id=$1 and date=$2`, [myId, tmr])).rows[0].lunch === true);
  await as(member, `select set_meal($1, $2::date, p_lunch => false)`, [myId, tmr]);
  await as(member, `select set_meal($1, $2::date, p_lunch => true, p_guest_lunch => 1)`, [myId, tmr]);
  ok('leave: once someone is approved to cook, members can turn lunch (and guests) on again', (await db.query(`select lunch, guest_lunch g from meals where member_id=$1 and date=$2`, [myId, tmr])).rows[0].g === 1);
  await as(mgr, `select cancel_cook_leave($1)`, [leaveId]);
  st = await lunchOn();
  ok('leave: cancel puts everyone back on their default meals', st.l === st.n && (await db.query(`select count(*)::int n from cook_volunteers`)).rows[0].n === 0, JSON.stringify(st));
  await as(mgr, `select set_cook_leave($1, $2::date, $2::date, array['lunch','dinner'])`, [mess, tmr]);
  st = await lunchOn();
  ok('leave: full day turns lunch and dinner off', st.l === 0 && st.d === 0);
  await throws('leave: cannot be marked for past days', () => as(mgr, `select set_cook_leave($1, today_dhaka() - 1, today_dhaka() - 1, array['lunch'])`, [mess]), 'INVALID_RANGE');
  await db.query(`delete from cook_leaves where mess_id=$1`, [mess]);
}

// ---- push subscriptions & server-only data
await as(B, `insert into push_subscriptions(user_id, endpoint, p256dh, auth) values ($1, 'https://push/b', 'k', 'a')`, [B]);
await throws('cannot subscribe as someone else', () => as(B, `insert into push_subscriptions(user_id, endpoint, p256dh, auth) values ($1, 'https://push/x', 'k', 'a')`, [A]), 'row-level security');
ok('A cannot see B subscription', (await as(A, `select count(*)::int n from push_subscriptions`)).rows[0].n === 0);
ok('notification_log hidden', (await as(B, `select count(*)::int n from notification_log`)).rows[0].n === 0);
const svc = (await asRole('service_role', '', `select month_summary($1, today_dhaka()) s`, [mess])).rows[0].s;
ok('service role reads summary', svc.members.length === 3);
await throws('anon cannot read summary', () => asRole('anon', '', `select month_summary($1, today_dhaka())`, [mess]), 'permission denied');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
