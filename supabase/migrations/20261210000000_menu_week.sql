-- MessFlow: the menu for a range of days in one call (members' "This week's menu", Saturday → Friday).
-- Each day is the same merged menu as menu_for_day: the day's own dishes, else the weekly menu.
-- Runs with the caller's rights, so only members and the cook of the mess get anything back.
create function public.menus_between(p_mess uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'menu', public.menu_for_day(p_mess, d::date)) order by d), '[]'::jsonb)
  from generate_series(p_from, least(p_to, p_from + 13), interval '1 day') d
$$;
revoke execute on function public.menus_between(uuid, date, date) from public, anon;
grant execute on function public.menus_between(uuid, date, date) to authenticated, service_role;
