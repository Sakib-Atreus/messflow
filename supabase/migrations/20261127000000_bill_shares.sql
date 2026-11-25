-- MessFlow: choose which of a month's fixed bills a member shares (e.g. someone joining mid-month)
--
-- set_bill_share(cost, member, mode, amount)
--   mode 'none'   → the member pays nothing towards this bill
--   mode 'equal'  → the member pays an equal part (total ÷ number of payers)
--   mode 'amount' → the member pays exactly p_amount
-- The other payers' shares are rescaled in proportion, so the bill total never changes.

create function public.set_bill_share(p_cost uuid, p_member uuid, p_mode text, p_amount numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.fixed_costs;
  v_others numeric;   -- what everyone else pays now
  v_payers integer;   -- how many others pay something
  v_new numeric;      -- what this member will pay
  v_left numeric;     -- what everyone else will pay
  v_sum numeric;
  v_spread numeric;
begin
  select * into f from public.fixed_costs where id = p_cost;
  if f.id is null then raise exception 'INVALID_INPUT'; end if;
  if not public.has_perm(f.mess_id, 'costs') then raise exception 'FORBIDDEN'; end if;
  perform public.assert_month_open(f.mess_id, f.month);
  if not exists (select 1 from public.mess_members where id = p_member and mess_id = f.mess_id) then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(sum(amount), 0), count(*) filter (where amount > 0)
    into v_others, v_payers
    from public.fixed_cost_shares where fixed_cost_id = p_cost and member_id <> p_member;

  v_new := case p_mode
             when 'none'   then 0
             when 'equal'  then round(f.amount / (v_payers + 1), 2)
             when 'amount' then round(p_amount, 2)
           end;
  if v_new is null or v_new < 0 or v_new > f.amount then raise exception 'INVALID_INPUT'; end if;
  v_left := f.amount - v_new;
  -- someone else has to cover the rest
  if v_left > 0 and v_others = 0 then raise exception 'NO_MEMBERS'; end if;

  if v_others > 0 then
    update public.fixed_cost_shares
       set amount = floor(amount * v_left / v_others * 100) / 100
     where fixed_cost_id = p_cost and member_id <> p_member;
  end if;

  delete from public.fixed_cost_shares where fixed_cost_id = p_cost and member_id = p_member;
  if v_new > 0 then
    insert into public.fixed_cost_shares (fixed_cost_id, mess_id, member_id, amount)
    values (p_cost, f.mess_id, p_member, v_new);
  end if;

  -- rounding: the paisa left over goes to the largest other share, so shares sum exactly to the bill
  select coalesce(sum(amount), 0) into v_sum from public.fixed_cost_shares where fixed_cost_id = p_cost;
  if v_sum <> f.amount then
    update public.fixed_cost_shares set amount = amount + (f.amount - v_sum)
     where fixed_cost_id = p_cost
       and member_id = (select member_id from public.fixed_cost_shares
                         where fixed_cost_id = p_cost and member_id <> p_member
                         order by amount desc, member_id limit 1);
  end if;
  delete from public.fixed_cost_shares where fixed_cost_id = p_cost and amount = 0;

  -- label stays honest: "equal" only while every payer pays the same (to the paisa)
  select max(amount) - min(amount) into v_spread from public.fixed_cost_shares where fixed_cost_id = p_cost;
  update public.fixed_costs
     set split_type = case when coalesce(v_spread, 0) <= 0.01 then 'equal'::public.split_type else 'custom'::public.split_type end
   where id = p_cost;
end $$;

revoke execute on function public.set_bill_share(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.set_bill_share(uuid, uuid, text, numeric) to authenticated, service_role;
