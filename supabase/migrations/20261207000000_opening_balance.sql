-- MessFlow: opening balances. When a mess that already ran on a notebook moves to the app, the
-- manager enters each person's old balance once (owes = negative, is owed = positive). It counts as
-- "carried in" for that first month, so bills, deposits and cash in hand stay real. Editable until
-- the mess closes its first month; after that it's part of the closed bill and can't change.

create table public.opening_balances (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  member_id  uuid not null unique references public.mess_members on delete cascade,
  month      date not null,                        -- the month it is carried into (first of month)
  amount     numeric(12,2) not null check (amount <> 0),
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
create index on public.opening_balances (mess_id, month);
alter table public.opening_balances enable row level security;
create policy opening_select on public.opening_balances for select to authenticated using (public.is_member(mess_id));
grant select on public.opening_balances to authenticated;
grant all on public.opening_balances to service_role;

-- carried in = last month's closed balance + this month's opening balance (if any)
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
  'where b.member_id = m.id and pm.month = v_prev and pm.status = ''closed''), 0) as carry_in',
  'where b.member_id = m.id and pm.month = v_prev and pm.status = ''closed''), 0)
      + coalesce((select ob.amount from public.opening_balances ob
                   where ob.member_id = m.id and ob.month = v_start), 0) as carry_in');

-- Manager: save everyone's opening balance in one go. p_rows = [{"member_id": "...", "amount": -1200}, …]
-- (0 or missing = none). Only while the mess has never closed a month.
create function public.set_opening_balances(p_mess uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', public.today_dhaka())::date;
  r jsonb;
  v_n integer := 0;
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.months where mess_id = p_mess and status = 'closed') then
    raise exception 'OPENING_LOCKED';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from public.mess_members where id = (r ->> 'member_id')::uuid and mess_id = p_mess) then
      raise exception 'FORBIDDEN';
    end if;
    if coalesce((r ->> 'amount')::numeric, 0) = 0 then
      delete from public.opening_balances where member_id = (r ->> 'member_id')::uuid;
    else
      insert into public.opening_balances (mess_id, member_id, month, amount, updated_by)
      values (p_mess, (r ->> 'member_id')::uuid, v_month, round((r ->> 'amount')::numeric, 2), auth.uid())
      on conflict (member_id) do update set month = excluded.month, amount = excluded.amount,
        updated_by = excluded.updated_by, updated_at = now();
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.set_opening_balances(uuid, jsonb) from public, anon;
grant execute on function public.set_opening_balances(uuid, jsonb) to authenticated, service_role;
