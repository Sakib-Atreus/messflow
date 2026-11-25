-- MessFlow: per-mess settings, repeating bills, meal-rate rounding, notification inbox.

-- ---------------------------------------------------------------------------
-- Settings (per mess)
-- ---------------------------------------------------------------------------
alter table public.messes
  -- 'exact' = bazar ÷ meals as is; 'sheet' = round the rate to 2 decimals first (like a paper sheet)
  add column meal_rate_rounding text not null default 'exact' check (meal_rate_rounding in ('exact', 'sheet')),
  -- warn when about this many days of meal money are left
  add column low_meal_days smallint not null default 3 check (low_meal_days between 2 and 5),
  -- weekly dues reminder: weekday 0 = Sunday … 6 = Saturday, null = off; time in minutes after midnight
  add column dues_reminder_day smallint default 5 check (dues_reminder_day between 0 and 6),
  add column dues_reminder_time smallint not null default 600 check (dues_reminder_time between 0 and 1439),
  -- bazar duty reminder the evening before: minutes after midnight, null = off
  add column duty_reminder_time smallint default 1200 check (duty_reminder_time between 0 and 1439),
  -- meal cutoff reminder: minutes before the cutoff, null = off
  add column cutoff_reminder_min smallint default 45 check (cutoff_reminder_min in (30, 45, 60)),
  -- meals a new member gets by default
  add column new_member_breakfast boolean not null default false,
  add column new_member_lunch boolean not null default true,
  add column new_member_dinner boolean not null default true;

create or replace function pg_temp.patch(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch: "%" not found in %', p_from, p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;

-- meal rate rounding option
select pg_temp.patch('public.month_summary(uuid, date)',
  'v_rate := case when v_meals > 0 then v_bazar / v_meals else 0 end;',
  'v_rate := case when v_meals > 0 then v_bazar / v_meals else 0 end;
  if ms.meal_rate_rounding = ''sheet'' then v_rate := round(v_rate, 2); end if;');

-- approved join requests get the mess's default meals
select pg_temp.patch('public.review_join_request(uuid, boolean)',
  'insert into public.mess_members (mess_id, user_id, display_name, claim_code)
      values (r.mess_id, r.user_id, r.display_name, null)',
  'insert into public.mess_members (mess_id, user_id, display_name, claim_code, default_breakfast, default_lunch, default_dinner)
      select r.mess_id, r.user_id, r.display_name, null, ms.new_member_breakfast, ms.new_member_lunch, ms.new_member_dinner
        from public.messes ms where ms.id = r.mess_id');

-- ---------------------------------------------------------------------------
-- Repeating bills: copied into each new month (equal bills re-split among that month's members)
-- ---------------------------------------------------------------------------
alter table public.fixed_costs
  add column repeat_monthly boolean not null default false,
  add column copied_from uuid references public.fixed_costs on delete set null;
create unique index fixed_costs_copied_once on public.fixed_costs (copied_from) where copied_from is not null;

create policy fixed_update on public.fixed_costs for update to authenticated
  using (public.has_perm(mess_id, 'costs')) with check (public.has_perm(mess_id, 'costs'));
grant update (repeat_monthly) on public.fixed_costs to authenticated;

create function public.ensure_recurring_bills(p_mess uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', public.today_dhaka())::date;
  v_prev  date := (date_trunc('month', public.today_dhaka()) - interval '1 month')::date;
  v_end   date := (date_trunc('month', public.today_dhaka()) + interval '1 month - 1 day')::date;
  c public.fixed_costs;
  v_id uuid;
  v_count integer := 0;
  v_n integer;
  v_each numeric(12,2);
  v_amount numeric(12,2);
begin
  if auth.uid() is not null and not public.is_member(p_mess) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.months where mess_id = p_mess and month = v_month and status = 'closed') then return 0; end if;

  for c in
    select * from public.fixed_costs f
     where f.mess_id = p_mess and f.month = v_prev and f.repeat_monthly
       and not exists (select 1 from public.fixed_costs x where x.copied_from = f.id)
  loop
    if c.split_type = 'equal' then
      select count(*) into v_n from public.mess_members
       where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_month);
      continue when v_n = 0;
      insert into public.fixed_costs (mess_id, month, category, title, amount, split_type, repeat_monthly, copied_from)
      values (p_mess, v_month, c.category, c.title, c.amount, 'equal', true, c.id) returning id into v_id;
      v_each := floor(c.amount / v_n * 100) / 100;
      insert into public.fixed_cost_shares (fixed_cost_id, mess_id, member_id, amount)
      select v_id, p_mess, id, v_each + case when row_number() over (order by joined_on, id) = 1 then c.amount - v_each * v_n else 0 end
        from public.mess_members
       where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_month);
    else
      -- custom split: same people, same amounts (anyone who left is dropped)
      select coalesce(sum(s.amount), 0) into v_amount
        from public.fixed_cost_shares s join public.mess_members m on m.id = s.member_id
       where s.fixed_cost_id = c.id and (m.left_on is null or m.left_on >= v_month) and s.amount > 0;
      continue when v_amount <= 0;
      insert into public.fixed_costs (mess_id, month, category, title, amount, split_type, repeat_monthly, copied_from)
      values (p_mess, v_month, c.category, c.title, v_amount, 'custom', true, c.id) returning id into v_id;
      insert into public.fixed_cost_shares (fixed_cost_id, mess_id, member_id, amount)
      select v_id, p_mess, s.member_id, s.amount
        from public.fixed_cost_shares s join public.mess_members m on m.id = s.member_id
       where s.fixed_cost_id = c.id and (m.left_on is null or m.left_on >= v_month) and s.amount > 0;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.ensure_recurring_bills(uuid) from public, anon;
grant execute on function public.ensure_recurring_bills(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notification inbox: every notification we send is also kept here for the bell
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  title      text not null,
  body       text,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
