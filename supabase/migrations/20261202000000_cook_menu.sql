-- MessFlow: cook (khala) logins and the daily menu ("what to cook").

-- ---------------------------------------------------------------------------
-- Cooks: a login that only sees the kitchen page. Not a member: no meals, bills or balance.
-- ---------------------------------------------------------------------------
create table public.mess_cooks (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  user_id    uuid not null unique references public.profiles on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create index on public.mess_cooks (mess_id);
alter table public.mess_cooks enable row level security;
-- the cook sees their own row; the manager sees the mess's cooks. Writes go through the server (service role).
create policy cooks_select on public.mess_cooks for select to authenticated
  using (user_id = auth.uid() or public.is_manager(mess_id));
grant select on public.mess_cooks to authenticated;
grant all on public.mess_cooks to service_role;

create function public.is_cook(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mess_cooks where mess_id = p_mess and user_id = auth.uid())
$$;
revoke execute on function public.is_cook(uuid) from public, anon;
grant execute on function public.is_cook(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily menu: written by the manager, seen by everyone in the mess and the cook
-- ---------------------------------------------------------------------------
create table public.meal_menus (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  date       date not null,
  breakfast  text check (length(breakfast) <= 200),
  lunch      text check (length(lunch) <= 200),
  dinner     text check (length(dinner) <= 200),
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  unique (mess_id, date)
);
alter table public.meal_menus enable row level security;
create policy menus_select on public.meal_menus for select to authenticated
  using (public.is_member(mess_id) or public.is_cook(mess_id));
create policy menus_insert on public.meal_menus for insert to authenticated
  with check (public.is_manager(mess_id));
create policy menus_update on public.meal_menus for update to authenticated
  using (public.is_manager(mess_id)) with check (public.is_manager(mess_id));
create policy menus_delete on public.meal_menus for delete to authenticated
  using (public.is_manager(mess_id));
grant select, insert, update, delete on public.meal_menus to authenticated;
grant all on public.meal_menus to service_role;

-- ---------------------------------------------------------------------------
-- Kitchen numbers for one day: meals to cook per meal (half = 0.5, each guest = 1).
-- Members who have no row yet for that day count with their default meals.
-- ---------------------------------------------------------------------------
create function public.kitchen_day(p_mess uuid, p_date date default public.today_dhaka()) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ms public.messes;
  v jsonb;
begin
  if not (public.is_member(p_mess) or public.is_cook(p_mess)) then raise exception 'FORBIDDEN'; end if;
  select * into ms from public.messes where id = p_mess;

  select jsonb_build_object(
    'breakfast', coalesce(sum(case when b then (case when hb then 0.5 else 1 end) else 0 end + gb), 0),
    'lunch',     coalesce(sum(case when l then (case when hl then 0.5 else 1 end) else 0 end + gl), 0),
    'dinner',    coalesce(sum(case when d then (case when hd then 0.5 else 1 end) else 0 end + gd), 0)
  ) into v
  from (
    select coalesce(ml.breakfast, mm.default_breakfast and ms.breakfast_enabled) as b,
           coalesce(ml.lunch, mm.default_lunch) as l,
           coalesce(ml.dinner, mm.default_dinner) as d,
           coalesce(ml.half_breakfast, false) as hb, coalesce(ml.half_lunch, false) as hl, coalesce(ml.half_dinner, false) as hd,
           coalesce(ml.guest_breakfast, 0) as gb, coalesce(ml.guest_lunch, 0) as gl, coalesce(ml.guest_dinner, 0) as gd
      from public.mess_members mm
      left join public.meals ml on ml.member_id = mm.id and ml.date = p_date
     where mm.mess_id = p_mess
       and mm.joined_on <= p_date
       and (mm.left_on is null or mm.left_on >= p_date)
  ) x;

  return v || jsonb_build_object(
    'mess', ms.name,
    'date', p_date,
    'breakfast_enabled', ms.breakfast_enabled,
    -- cutoffs as minutes from 00:00 of the meal date (Dhaka); negative = the evening before
    'breakfast_cutoff', extract(epoch from ms.breakfast_cutoff) / 60,
    'lunch_cutoff', extract(epoch from ms.lunch_cutoff) / 60,
    'dinner_cutoff', extract(epoch from ms.dinner_cutoff) / 60,
    'menu', (select jsonb_build_object('breakfast', mn.breakfast, 'lunch', mn.lunch, 'dinner', mn.dinner)
               from public.meal_menus mn where mn.mess_id = p_mess and mn.date = p_date)
  );
end $$;
revoke execute on function public.kitchen_day(uuid, date) from public, anon;
grant execute on function public.kitchen_day(uuid, date) to authenticated, service_role;
