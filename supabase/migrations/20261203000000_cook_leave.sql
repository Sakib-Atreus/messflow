-- MessFlow: khala's (cook's) leave. The manager marks a meal as "khala on leave": that meal goes off
-- for everyone. A member who will cook taps "I'll cook"; once the manager approves, their meal is on
-- and everyone else may turn theirs on again.

create table public.cook_leaves (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  date       date not null,
  meal       text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (mess_id, date, meal)
);
create index on public.cook_leaves (mess_id, date);
alter table public.cook_leaves enable row level security;
create policy cook_leaves_select on public.cook_leaves for select to authenticated
  using (public.is_member(mess_id) or public.is_cook(mess_id));
grant select on public.cook_leaves to authenticated;
grant all on public.cook_leaves to service_role;

create table public.cook_volunteers (
  id          uuid primary key default gen_random_uuid(),
  leave_id    uuid not null references public.cook_leaves on delete cascade,
  mess_id     uuid not null references public.messes on delete cascade,
  member_id   uuid not null references public.mess_members on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  unique (leave_id, member_id)
);
create index on public.cook_volunteers (mess_id, status);
alter table public.cook_volunteers enable row level security;
create policy cook_volunteers_select on public.cook_volunteers for select to authenticated
  using (public.is_member(mess_id));
grant select on public.cook_volunteers to authenticated;
grant all on public.cook_volunteers to service_role;

-- true when khala is on leave for this meal (whether or not someone else cooks)
create function public.is_leave_meal(p_mess uuid, p_date date, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cook_leaves where mess_id = p_mess and date = p_date and meal = p_kind)
$$;

-- true when the meal is closed: khala on leave and nobody approved to cook yet
create function public.leave_closed(p_mess uuid, p_date date, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cook_leaves l
     where l.mess_id = p_mess and l.date = p_date and l.meal = p_kind
       and not exists (select 1 from public.cook_volunteers v where v.leave_id = l.id and v.status = 'approved')
  )
$$;
revoke execute on function public.is_leave_meal(uuid, date, text) from public, anon;
revoke execute on function public.leave_closed(uuid, date, text) from public, anon;
grant execute on function public.is_leave_meal(uuid, date, text) to authenticated, service_role;
grant execute on function public.leave_closed(uuid, date, text) to authenticated, service_role;

create or replace function pg_temp.patch(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch: "%" not found in %', p_from, p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;

-- members cannot turn a closed leave meal (or its guests) on; managers / the meals permission can
select pg_temp.patch('public.set_meal(uuid, date, boolean, boolean, boolean, integer, integer, integer)',
  '  if p_breakfast and not ms.breakfast_enabled then raise exception ''BREAKFAST_DISABLED''; end if;',
  '  if p_breakfast and not ms.breakfast_enabled then raise exception ''BREAKFAST_DISABLED''; end if;
  if not v_staff and (
       ((p_breakfast or coalesce(p_guest_breakfast, 0) > 0) and public.leave_closed(m.mess_id, p_date, ''breakfast''))
    or ((p_lunch     or coalesce(p_guest_lunch, 0) > 0)     and public.leave_closed(m.mess_id, p_date, ''lunch''))
    or ((p_dinner    or coalesce(p_guest_dinner, 0) > 0)    and public.leave_closed(m.mess_id, p_date, ''dinner''))
  ) then
    raise exception ''COOK_LEAVE'';
  end if;');

-- a day's row created later (new member, first change) starts with leave meals off
select pg_temp.patch('public.set_meal(uuid, date, boolean, boolean, boolean, integer, integer, integer)',
  '    v_active and m.default_breakfast and ms.breakfast_enabled,
    v_active and m.default_lunch,
    v_active and m.default_dinner,',
  '    v_active and m.default_breakfast and ms.breakfast_enabled and not public.is_leave_meal(m.mess_id, p_date, ''breakfast''),
    v_active and m.default_lunch and not public.is_leave_meal(m.mess_id, p_date, ''lunch''),
    v_active and m.default_dinner and not public.is_leave_meal(m.mess_id, p_date, ''dinner''),');
select pg_temp.patch('public.generate_daily_meals(date, uuid)',
  'mm.default_breakfast and ms.breakfast_enabled, mm.default_lunch, mm.default_dinner, ''auto''',
  'mm.default_breakfast and ms.breakfast_enabled and not public.is_leave_meal(mm.mess_id, p_date, ''breakfast''),
         mm.default_lunch and not public.is_leave_meal(mm.mess_id, p_date, ''lunch''),
         mm.default_dinner and not public.is_leave_meal(mm.mess_id, p_date, ''dinner''), ''auto''');

-- ---------------------------------------------------------------------------
-- Manager: mark khala's leave for a date range and some meals. Those meals go off for everyone.
-- ---------------------------------------------------------------------------
create function public.set_cook_leave(p_mess uuid, p_from date, p_to date, p_meals text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  ms public.messes;
  d date;
  k text;
  v_n integer := 0;
  v_new integer;
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;
  if p_to < p_from or p_to - p_from > 30 then raise exception 'INVALID_RANGE'; end if;
  if p_from < public.today_dhaka() then raise exception 'INVALID_RANGE'; end if;
  select * into ms from public.messes where id = p_mess;

  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    perform public.assert_month_open(p_mess, d);
    foreach k in array p_meals loop
      continue when k not in ('breakfast', 'lunch', 'dinner') or (k = 'breakfast' and not ms.breakfast_enabled);
      insert into public.cook_leaves (mess_id, date, meal, created_by) values (p_mess, d, k, auth.uid())
      on conflict (mess_id, date, meal) do nothing;
      get diagnostics v_new = row_count;
      v_n := v_n + v_new;
    end loop;

    -- make sure everyone has a row for the day (leave meals start off), then switch the leave meals off
    insert into public.meals (mess_id, member_id, date, breakfast, lunch, dinner, source)
    select p_mess, mm.id, d,
           mm.default_breakfast and ms.breakfast_enabled and not public.is_leave_meal(p_mess, d, 'breakfast'),
           mm.default_lunch and not public.is_leave_meal(p_mess, d, 'lunch'),
           mm.default_dinner and not public.is_leave_meal(p_mess, d, 'dinner'), 'auto'
      from public.mess_members mm
     where mm.mess_id = p_mess and mm.joined_on <= d and (mm.left_on is null or mm.left_on >= d)
    on conflict (member_id, date) do nothing;

    update public.meals set
      breakfast       = case when 'breakfast' = any(p_meals) then false else breakfast end,
      half_breakfast  = case when 'breakfast' = any(p_meals) then false else half_breakfast end,
      guest_breakfast = case when 'breakfast' = any(p_meals) then 0 else guest_breakfast end,
      lunch           = case when 'lunch' = any(p_meals) then false else lunch end,
      half_lunch      = case when 'lunch' = any(p_meals) then false else half_lunch end,
      guest_lunch     = case when 'lunch' = any(p_meals) then 0 else guest_lunch end,
      dinner          = case when 'dinner' = any(p_meals) then false else dinner end,
      half_dinner     = case when 'dinner' = any(p_meals) then false else half_dinner end,
      guest_dinner    = case when 'dinner' = any(p_meals) then 0 else guest_dinner end,
      source = 'manager', updated_by = auth.uid(), updated_at = now()
     where mess_id = p_mess and date = d;
  end loop;
  return v_n;
end $$;

-- Manager: khala comes after all. That meal goes back to everyone's default.
create function public.cancel_cook_leave(p_leave uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.cook_leaves; ms public.messes;
begin
  select * into l from public.cook_leaves where id = p_leave;
  if not found or not public.is_manager(l.mess_id) then raise exception 'FORBIDDEN'; end if;
  perform public.assert_month_open(l.mess_id, l.date);
  select * into ms from public.messes where id = l.mess_id;
  delete from public.cook_leaves where id = l.id;
  update public.meals ml set
    breakfast      = case when l.meal = 'breakfast' then mm.default_breakfast and ms.breakfast_enabled else ml.breakfast end,
    half_breakfast = case when l.meal = 'breakfast' then false else ml.half_breakfast end,
    lunch          = case when l.meal = 'lunch' then mm.default_lunch else ml.lunch end,
    half_lunch     = case when l.meal = 'lunch' then false else ml.half_lunch end,
    dinner         = case when l.meal = 'dinner' then mm.default_dinner else ml.dinner end,
    half_dinner    = case when l.meal = 'dinner' then false else ml.half_dinner end,
    source = 'manager', updated_by = auth.uid(), updated_at = now()
    from public.mess_members mm
   where mm.id = ml.member_id and ml.mess_id = l.mess_id and ml.date = l.date
     and mm.joined_on <= l.date and (mm.left_on is null or mm.left_on >= l.date);
end $$;

-- Member: "I'll cook" for a leave meal. The manager approves or rejects it.
create function public.volunteer_to_cook(p_leave uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.cook_leaves; m public.mess_members; v_id uuid;
begin
  select * into l from public.cook_leaves where id = p_leave;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into m from public.mess_members
   where mess_id = l.mess_id and user_id = auth.uid() and status = 'active'
     and joined_on <= l.date and (left_on is null or left_on >= l.date);
  if not found then raise exception 'FORBIDDEN'; end if;
  if l.date < public.today_dhaka() then raise exception 'CUTOFF_PASSED'; end if;
  insert into public.cook_volunteers (leave_id, mess_id, member_id) values (l.id, l.mess_id, m.id)
  on conflict (leave_id, member_id) do update set status = 'pending', reviewed_by = null, reviewed_at = null, created_at = now()
    where public.cook_volunteers.status = 'rejected'
  returning id into v_id;
  return v_id;
end $$;

-- Manager: approve (their meal goes on, others may turn theirs on) or reject.
create function public.review_cook_volunteer(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.cook_volunteers; l public.cook_leaves;
begin
  select * into v from public.cook_volunteers where id = p_id;
  if not found or not public.is_manager(v.mess_id) then raise exception 'FORBIDDEN'; end if;
  select * into l from public.cook_leaves where id = v.leave_id;
  update public.cook_volunteers set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;
  if p_approve then
    perform public.set_meal(v.member_id, l.date,
      p_breakfast => case when l.meal = 'breakfast' then true end,
      p_lunch     => case when l.meal = 'lunch' then true end,
      p_dinner    => case when l.meal = 'dinner' then true end);
  end if;
end $$;

revoke execute on function public.set_cook_leave(uuid, date, date, text[]) from public, anon;
revoke execute on function public.cancel_cook_leave(uuid) from public, anon;
revoke execute on function public.volunteer_to_cook(uuid) from public, anon;
revoke execute on function public.review_cook_volunteer(uuid, boolean) from public, anon;
grant execute on function public.set_cook_leave(uuid, date, date, text[]) to authenticated, service_role;
grant execute on function public.cancel_cook_leave(uuid) to authenticated, service_role;
grant execute on function public.volunteer_to_cook(uuid) to authenticated, service_role;
grant execute on function public.review_cook_volunteer(uuid, boolean) to authenticated, service_role;

-- the cook's page: which meals are on leave today
select pg_temp.patch('public.kitchen_day(uuid, date)',
  '    ''mess'', ms.name,',
  '    ''mess'', ms.name,
    ''leave'', (select coalesce(jsonb_object_agg(cl.meal, true), ''{}''::jsonb)
                from public.cook_leaves cl where cl.mess_id = p_mess and cl.date = p_date),');
