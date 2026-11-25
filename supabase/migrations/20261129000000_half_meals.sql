-- MessFlow: half meals (e.g. a light lunch that counts as 0.5), like the 0.5 entries in a paper sheet.
-- A meal that is ON and marked half counts 0.5 × that meal's weight. Guests still count in full.

alter table public.meals
  add column half_breakfast boolean not null default false,
  add column half_lunch     boolean not null default false,
  add column half_dinner    boolean not null default false;

-- month_summary (and close_month, which uses it): count a half meal as 0.5
create or replace function pg_temp.patch(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch: "%" not found in %', p_from, p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;

select pg_temp.patch('public.month_summary(uuid, date)',
  '(ml.breakfast::int + ml.guest_breakfast)',
  '(ml.breakfast::int * (case when ml.half_breakfast then 0.5 else 1 end) + ml.guest_breakfast)');
select pg_temp.patch('public.month_summary(uuid, date)',
  '(ml.lunch::int     + ml.guest_lunch)',
  '(ml.lunch::int * (case when ml.half_lunch then 0.5 else 1 end) + ml.guest_lunch)');
select pg_temp.patch('public.month_summary(uuid, date)',
  '(ml.dinner::int    + ml.guest_dinner)',
  '(ml.dinner::int * (case when ml.half_dinner then 0.5 else 1 end) + ml.guest_dinner)');

-- Mark one meal as half (or full again). Same rules as set_meal: the meals permission any time,
-- a member only their own meal and only before that meal's cutoff. Turning half on also turns the meal on.
create function public.set_meal_half(p_member uuid, p_date date, p_kind text, p_half boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m  public.mess_members;
  ms public.messes;
  v_cut interval;
begin
  if p_kind not in ('breakfast', 'lunch', 'dinner') then raise exception 'INVALID_INPUT'; end if;
  select * into m from public.mess_members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  select * into ms from public.messes where id = m.mess_id;

  if not public.has_perm(m.mess_id, 'meals') then
    if m.user_id is distinct from auth.uid() or m.status <> 'active' then raise exception 'FORBIDDEN'; end if;
    v_cut := case p_kind when 'breakfast' then ms.breakfast_cutoff when 'lunch' then ms.lunch_cutoff else ms.dinner_cutoff end;
    if (now() at time zone 'Asia/Dhaka') >= p_date + v_cut then raise exception 'CUTOFF_PASSED'; end if;
  end if;

  -- creates the day's row if needed (and switches the meal on when it becomes half)
  perform public.set_meal(
    p_member, p_date,
    p_breakfast => case when p_kind = 'breakfast' and p_half then true end,
    p_lunch     => case when p_kind = 'lunch'     and p_half then true end,
    p_dinner    => case when p_kind = 'dinner'    and p_half then true end
  );

  update public.meals set
    half_breakfast = case when p_kind = 'breakfast' then p_half else half_breakfast end,
    half_lunch     = case when p_kind = 'lunch'     then p_half else half_lunch end,
    half_dinner    = case when p_kind = 'dinner'    then p_half else half_dinner end,
    source = case when public.has_perm(m.mess_id, 'meals') and m.user_id is distinct from auth.uid() then 'manager'::public.meal_source else 'member'::public.meal_source end
  where member_id = p_member and date = p_date;
end $$;

revoke execute on function public.set_meal_half(uuid, date, text, boolean) from public, anon;
grant execute on function public.set_meal_half(uuid, date, text, boolean) to authenticated, service_role;
