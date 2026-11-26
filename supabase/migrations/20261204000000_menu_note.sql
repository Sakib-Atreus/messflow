-- MessFlow: a free-text message from the manager to the cook for a day (shown on the kitchen page).
alter table public.meal_menus add column note text check (length(note) <= 500);

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
  'jsonb_build_object(''breakfast'', mn.breakfast, ''lunch'', mn.lunch, ''dinner'', mn.dinner)',
  'jsonb_build_object(''breakfast'', mn.breakfast, ''lunch'', mn.lunch, ''dinner'', mn.dinner, ''note'', mn.note)');
