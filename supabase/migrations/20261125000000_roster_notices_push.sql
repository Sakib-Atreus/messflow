-- MessFlow: bazar duty roster, notice board support, push notifications

-- ---------------------------------------------------------------------------
-- Private config (not exposed through the API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table private.config (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Notification preferences & push subscriptions
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notify_prefs jsonb not null
  default '{"cutoff": true, "duty": true, "dues": true, "notices": true, "deposits": true}';

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

-- de-duplicates scheduled notifications (e.g. one lunch-cutoff reminder per mess per day)
create table public.notification_log (
  mess_id uuid not null references public.messes on delete cascade,
  kind    text not null,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (mess_id, kind, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security; -- service role only

create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Bazar duty roster
-- ---------------------------------------------------------------------------
create table public.bazar_roster (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  date       date not null,
  member_id  uuid not null references public.mess_members on delete cascade,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (mess_id, date, member_id)
);
create index on public.bazar_roster (mess_id, date);

alter table public.bazar_roster enable row level security;
create policy roster_select on public.bazar_roster for select to authenticated using (public.is_member(mess_id));
create policy roster_insert on public.bazar_roster for insert to authenticated with check (public.is_staff(mess_id));
create policy roster_update on public.bazar_roster for update to authenticated
  using (public.is_staff(mess_id)) with check (public.is_staff(mess_id));
create policy roster_delete on public.bazar_roster for delete to authenticated using (public.is_staff(mess_id));

create trigger audit after insert or update or delete on public.bazar_roster
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.notices
  for each row execute function public.audit_trigger();

-- Adding a bazar entry marks the shopper's duty for that day as done.
create function public.mark_duty_done() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.shopper_id is not null then
    update public.bazar_roster set done = true
     where mess_id = new.mess_id and date = new.date and member_id = new.shopper_id;
  end if;
  return null;
end $$;

create trigger mark_duty_done after insert on public.bazar_entries
  for each row execute function public.mark_duty_done();

-- Builds a rotation: p_members in order, one turn every p_every days, p_per_turn people per turn.
-- Replaces not-yet-done duties in the date range.
create function public.generate_roster(
  p_mess uuid, p_members uuid[], p_from date, p_to date,
  p_every integer default 1, p_per_turn integer default 1
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d date;
  i integer := 0;
  k integer;
  n integer := coalesce(array_length(p_members, 1), 0);
  v_count integer := 0;
begin
  if not public.is_staff(p_mess) then raise exception 'FORBIDDEN'; end if;
  if n = 0 or p_every < 1 or p_per_turn < 1 or p_per_turn > n
     or p_to < p_from or p_to - p_from > 92 then
    raise exception 'INVALID_INPUT';
  end if;
  if exists (select 1 from unnest(p_members) m
             where not exists (select 1 from public.mess_members x where x.id = m and x.mess_id = p_mess)) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.bazar_roster where mess_id = p_mess and date between p_from and p_to and not done;

  d := p_from;
  while d <= p_to loop
    for k in 1 .. p_per_turn loop
      insert into public.bazar_roster (mess_id, date, member_id)
      values (p_mess, d, p_members[(i % n) + 1])
      on conflict (mess_id, date, member_id) do nothing;
      i := i + 1;
      v_count := v_count + 1;
    end loop;
    d := d + p_every;
  end loop;
  return v_count;
end $$;

-- Swap two duties. Allowed for staff, or for a member who owns one of the two duties.
create function public.swap_duty(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.bazar_roster; b public.bazar_roster;
begin
  select * into a from public.bazar_roster where id = p_a;
  select * into b from public.bazar_roster where id = p_b;
  if a.id is null or b.id is null or a.mess_id <> b.mess_id then raise exception 'INVALID_INPUT'; end if;
  if a.done or b.done or a.date < public.today_dhaka() or b.date < public.today_dhaka() then
    raise exception 'INVALID_INPUT';
  end if;
  if not public.is_staff(a.mess_id) and not exists (
    select 1 from public.mess_members m
     where m.id in (a.member_id, b.member_id) and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if a.member_id = b.member_id then return; end if;
  if exists (select 1 from public.bazar_roster where mess_id = a.mess_id
               and ((date = a.date and member_id = b.member_id) or (date = b.date and member_id = a.member_id))) then
    raise exception 'DUTY_CONFLICT';
  end if;
  update public.bazar_roster set member_id = b.member_id where id = a.id;
  update public.bazar_roster set member_id = a.member_id where id = b.id;
end $$;

-- ---------------------------------------------------------------------------
-- month_summary: allow the server (service role, no user) to read it for due reminders
-- ---------------------------------------------------------------------------
create or replace function public.month_summary(p_mess uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev  date := (date_trunc('month', p_month) - interval '1 month')::date;
  -- meals pre-set for future days don't count yet
  v_meal_end date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, public.today_dhaka());
  ms public.messes;
  mo public.months;
  v_prev_closed boolean;
  v_bazar numeric;
  v_meals numeric;
  v_rate numeric;
  v_members jsonb;
begin
  -- auth.uid() is null only for the server's service role (execute is revoked from anon)
  if auth.uid() is not null and not public.is_member(p_mess) then raise exception 'FORBIDDEN'; end if;
  select * into ms from public.messes where id = p_mess;
  select * into mo from public.months where mess_id = p_mess and month = v_start;

  -- closed month: return frozen figures
  if mo.id is not null and mo.status = 'closed' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'member_id', b.member_id, 'display_name', m.display_name, 'room', m.room,
             'meals', b.meals, 'meal_cost', b.meal_cost, 'fixed_share', b.fixed_share,
             'deposits', b.deposits, 'carry_in', b.carry_in, 'balance', b.final_balance
           ) order by m.display_name), '[]'::jsonb)
      into v_members
      from public.member_month_bills b join public.mess_members m on m.id = b.member_id
     where b.month_id = mo.id;

    return jsonb_build_object(
      'month', v_start, 'status', 'closed', 'closed_at', mo.closed_at,
      'total_bazar', mo.total_bazar, 'total_meals', mo.total_meals, 'meal_rate', round(mo.meal_rate, 2),
      'total_fixed', mo.total_fixed, 'total_deposits', mo.total_deposits,
      'prev_month_closed', true, 'members', v_members
    );
  end if;

  select exists (select 1 from public.months where mess_id = p_mess and month = v_prev and status = 'closed')
    into v_prev_closed;

  select coalesce(sum(amount), 0) into v_bazar
    from public.bazar_entries where mess_id = p_mess and date between v_start and v_end;

  select coalesce(sum(
           (ml.breakfast::int + ml.guest_breakfast) * ms.breakfast_weight
         + (ml.lunch::int     + ml.guest_lunch)     * ms.lunch_weight
         + (ml.dinner::int    + ml.guest_dinner)    * ms.dinner_weight), 0)
    into v_meals
    from public.meals ml where ml.mess_id = p_mess and ml.date between v_start and v_meal_end;

  v_rate := case when v_meals > 0 then v_bazar / v_meals else 0 end;

  with per_member as (
    select m.id, m.display_name, m.room,
      coalesce((select sum(
                  (ml.breakfast::int + ml.guest_breakfast) * ms.breakfast_weight
                + (ml.lunch::int     + ml.guest_lunch)     * ms.lunch_weight
                + (ml.dinner::int    + ml.guest_dinner)    * ms.dinner_weight)
                from public.meals ml
               where ml.member_id = m.id and ml.date between v_start and v_meal_end), 0) as meals,
      coalesce((select sum(s.amount) from public.fixed_cost_shares s
                  join public.fixed_costs f on f.id = s.fixed_cost_id
                 where s.member_id = m.id and f.month = v_start), 0) as fixed_share,
      coalesce((select sum(d.amount) from public.deposits d
                 where d.member_id = m.id and d.status = 'approved'
                   and d.date between v_start and v_end), 0) as deposits,
      coalesce((select b.final_balance from public.member_month_bills b
                  join public.months pm on pm.id = b.month_id
                 where b.member_id = m.id and pm.month = v_prev and pm.status = 'closed'), 0) as carry_in
    from public.mess_members m
    where m.mess_id = p_mess
  ),
  computed as (
    select *, round(meals * v_rate, 2) as meal_cost from per_member
    where meals <> 0 or fixed_share <> 0 or deposits <> 0 or carry_in <> 0
       or id in (select id from public.mess_members
                  where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_start))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', id, 'display_name', display_name, 'room', room,
           'meals', meals, 'meal_cost', meal_cost, 'fixed_share', fixed_share,
           'deposits', deposits, 'carry_in', carry_in,
           'balance', carry_in + deposits - meal_cost - fixed_share
         ) order by display_name), '[]'::jsonb)
    into v_members from computed;

  return jsonb_build_object(
    'month', v_start, 'status', 'open', 'closed_at', null,
    'total_bazar', v_bazar, 'total_meals', v_meals, 'meal_rate', round(v_rate, 2),
    'total_fixed', (select coalesce(sum(amount), 0) from public.fixed_costs
                     where mess_id = p_mess and month = v_start),
    'total_deposits', (select coalesce(sum(amount), 0) from public.deposits
                        where mess_id = p_mess and status = 'approved' and date between v_start and v_end),
    'prev_month_closed', v_prev_closed,
    'members', v_members
  );
end $$;

revoke execute on function public.month_summary(uuid, date) from public, anon;

-- ---------------------------------------------------------------------------
-- Every 10 minutes the database pings the app, which sends due reminders
-- (meal cutoffs, tomorrow's bazar duty, weekly dues). Configure once with:
--   insert into private.config values
--     ('notify_url',  'https://YOUR-APP.vercel.app/api/cron/notify'),
--     ('cron_secret', 'same value as CRON_SECRET in Vercel');
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

create function private.call_notify() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url    from private.config where key = 'notify_url';
  select value into v_secret from private.config where key = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json')
  );
end $$;

select cron.schedule('messflow-notify', '*/10 * * * *', $$ select private.call_notify() $$);

grant select, insert, update, delete on public.push_subscriptions, public.bazar_roster to authenticated;
grant all on public.push_subscriptions, public.bazar_roster, public.notification_log to service_role;
grant execute on function public.generate_roster(uuid, uuid[], date, date, integer, integer) to authenticated;
grant execute on function public.swap_duty(uuid, uuid) to authenticated;
