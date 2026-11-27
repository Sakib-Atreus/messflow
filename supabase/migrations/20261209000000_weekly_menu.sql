-- MessFlow: weekly menu. The manager writes the dishes once per weekday (Saturday → Friday) and they
-- repeat every week. A day's own menu (meal_menus) still wins for that day, meal by meal; an empty
-- daily box falls back to the weekly dish. Khala's message stays per day (meal_menus.note).

create table public.weekly_menus (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  -- same numbering as extract(dow ...) and JavaScript getUTCDay(): 0 = Sunday … 6 = Saturday
  weekday    smallint not null check (weekday between 0 and 6),
  breakfast  text check (length(breakfast) <= 200),
  lunch      text check (length(lunch) <= 200),
  dinner     text check (length(dinner) <= 200),
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  unique (mess_id, weekday)
);
alter table public.weekly_menus enable row level security;
create policy weekly_menus_select on public.weekly_menus for select to authenticated
  using (public.is_member(mess_id) or public.is_cook(mess_id));
create policy weekly_menus_insert on public.weekly_menus for insert to authenticated
  with check (public.is_manager(mess_id));
create policy weekly_menus_update on public.weekly_menus for update to authenticated
  using (public.is_manager(mess_id)) with check (public.is_manager(mess_id));
create policy weekly_menus_delete on public.weekly_menus for delete to authenticated
  using (public.is_manager(mess_id));
grant select, insert, update, delete on public.weekly_menus to authenticated;
grant all on public.weekly_menus to service_role;

-- The menu people see for one day: each meal from the day's own menu, else from the weekly menu.
-- `weekly` says which meals came from the weekly menu. Null when nothing is set for that day.
-- Runs with the caller's rights, so the usual read rules (members and the cook) apply.
create function public.menu_for_day(p_mess uuid, p_date date) returns jsonb
language sql stable set search_path = '' as $$
  with d as (select * from public.meal_menus where mess_id = p_mess and date = p_date),
       w as (select * from public.weekly_menus where mess_id = p_mess and weekday = extract(dow from p_date)::smallint),
       m as (
         select nullif(trim((select breakfast from d)), '') as db, nullif(trim((select breakfast from w)), '') as wb,
                nullif(trim((select lunch from d)), '')     as dl, nullif(trim((select lunch from w)), '')     as wl,
                nullif(trim((select dinner from d)), '')    as dd, nullif(trim((select dinner from w)), '')    as wd,
                nullif(trim((select note from d)), '')      as note
       )
  select case when coalesce(db, wb, dl, wl, dd, wd, note) is null then null else jsonb_build_object(
    'breakfast', coalesce(db, wb),
    'lunch',     coalesce(dl, wl),
    'dinner',    coalesce(dd, wd),
    'note',      note,
    'weekly',    jsonb_build_object('breakfast', db is null and wb is not null,
                                    'lunch',     dl is null and wl is not null,
                                    'dinner',    dd is null and wd is not null)
  ) end
  from m
$$;
revoke execute on function public.menu_for_day(uuid, date) from public, anon;
grant execute on function public.menu_for_day(uuid, date) to authenticated, service_role;

-- the kitchen page uses the same merged menu
create or replace function pg_temp.patch(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch: "%" not found in %', p_from, p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;

select pg_temp.patch('public.kitchen_day(uuid, date)',
  '(select jsonb_build_object(''breakfast'', mn.breakfast, ''lunch'', mn.lunch, ''dinner'', mn.dinner, ''note'', mn.note)
               from public.meal_menus mn where mn.mess_id = p_mess and mn.date = p_date)',
  'public.menu_for_day(p_mess, p_date)');
