-- MessFlow: weekly bazar duty — the same member(s) on the same weekday every week.
-- The plan lives in weekly_duty; ensure_weekly_duty() turns it into bazar_roster rows up to
-- 4 weeks ahead. messes.weekly_filled_until remembers how far it has gone, so a swapped or
-- deleted duty is never put back.

create table public.weekly_duty (
  mess_id   uuid not null references public.messes on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),  -- 0 = Sunday … 6 = Saturday (extract(dow))
  member_id uuid not null references public.mess_members on delete cascade,
  primary key (mess_id, weekday, member_id)
);

alter table public.messes add column weekly_filled_until date;

alter table public.weekly_duty enable row level security;
create policy weekly_select on public.weekly_duty for select to authenticated using (public.is_member(mess_id));
-- writes only through save_weekly_duty()

-- Create duties from the weekly plan, from where it last stopped up to 4 weeks ahead. Cheap when nothing to do.
create function public.ensure_weekly_duty(p_mess uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_from date;
  v_to   date := public.today_dhaka() + 27;
  v_count integer;
begin
  if auth.uid() is not null and not public.is_member(p_mess) then raise exception 'FORBIDDEN'; end if;
  select greatest(coalesce(weekly_filled_until + 1, public.today_dhaka()), public.today_dhaka())
    into v_from from public.messes where id = p_mess;
  if v_from is null or v_from > v_to then return 0; end if;

  insert into public.bazar_roster (mess_id, date, member_id)
  select p_mess, d::date, w.member_id
    from generate_series(v_from, v_to, interval '1 day') d
    join public.weekly_duty w on w.mess_id = p_mess and w.weekday = extract(dow from d)
    join public.mess_members m on m.id = w.member_id
   where m.status = 'active'
     and m.joined_on <= d::date and (m.left_on is null or m.left_on >= d::date)
  on conflict (mess_id, date, member_id) do nothing;
  get diagnostics v_count = row_count;

  update public.messes set weekly_filled_until = v_to where id = p_mess;
  return v_count;
end $$;

-- Replace the weekly plan. p_plan = [{ "weekday": 6, "member_id": "…" }, …]
-- Not-done duties from p_from on the old and new plan's weekdays are rebuilt from the new plan.
create function public.save_weekly_duty(p_mess uuid, p_plan jsonb, p_from date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_from date := greatest(coalesce(p_from, public.today_dhaka()), public.today_dhaka());
  v_days smallint[];
begin
  if not public.has_perm(p_mess, 'roster') then raise exception 'FORBIDDEN'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_plan, '[]'::jsonb)) e
     where (e ->> 'weekday')::int not between 0 and 6
        or not exists (select 1 from public.mess_members m where m.id = (e ->> 'member_id')::uuid and m.mess_id = p_mess)
  ) then
    raise exception 'INVALID_INPUT';
  end if;

  -- weekdays touched by either the old or the new plan
  select array_agg(distinct x) into v_days from (
    select weekday as x from public.weekly_duty where mess_id = p_mess
    union select (e ->> 'weekday')::smallint from jsonb_array_elements(coalesce(p_plan, '[]'::jsonb)) e
  ) s;

  delete from public.weekly_duty where mess_id = p_mess;
  insert into public.weekly_duty (mess_id, weekday, member_id)
  select distinct p_mess, (e ->> 'weekday')::smallint, (e ->> 'member_id')::uuid
    from jsonb_array_elements(coalesce(p_plan, '[]'::jsonb)) e;

  if v_days is not null then
    delete from public.bazar_roster
     where mess_id = p_mess and date >= v_from and not done and extract(dow from date)::smallint = any (v_days);
  end if;
  update public.messes set weekly_filled_until = v_from - 1 where id = p_mess;
  return public.ensure_weekly_duty(p_mess);
end $$;

grant select on public.weekly_duty to authenticated;
grant all on public.weekly_duty to service_role;
revoke execute on function public.ensure_weekly_duty(uuid), public.save_weekly_duty(uuid, jsonb, date) from public, anon;
grant execute on function public.ensure_weekly_duty(uuid), public.save_weekly_duty(uuid, jsonb, date) to authenticated, service_role;
