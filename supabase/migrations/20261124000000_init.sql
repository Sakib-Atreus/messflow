-- MessFlow initial schema
-- Timezone for all business dates: Asia/Dhaka

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role    as enum ('manager', 'assistant', 'member');
create type public.member_status  as enum ('active', 'left');
create type public.meal_source    as enum ('auto', 'member', 'manager');
create type public.payment_method as enum ('cash', 'bkash', 'nagad', 'rocket', 'bank', 'other');
create type public.deposit_status as enum ('pending', 'approved', 'rejected');
create type public.split_type     as enum ('equal', 'custom');
create type public.month_status   as enum ('open', 'closed');

create function public.today_dhaka() returns date
language sql stable as $$ select (now() at time zone 'Asia/Dhaka')::date $$;

create function public.random_code() returns text
language sql volatile as $$ select upper(substr(md5(gen_random_uuid()::text), 1, 8)) $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text not null default '',
  phone      text,
  locale     text not null default 'bn' check (locale in ('bn', 'en')),
  created_at timestamptz not null default now()
);

create table public.messes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) > 0),
  address           text,
  invite_code       text not null unique default public.random_code(),
  breakfast_enabled boolean not null default false,
  breakfast_weight  numeric(4,2) not null default 0.5 check (breakfast_weight >= 0),
  lunch_weight      numeric(4,2) not null default 1   check (lunch_weight >= 0),
  dinner_weight     numeric(4,2) not null default 1   check (dinner_weight >= 0),
  -- cutoff = offset from 00:00 of the meal date (Dhaka). '-01:00' = 11 PM the night before
  breakfast_cutoff  interval not null default '-01:00',
  lunch_cutoff      interval not null default '10:00',
  dinner_cutoff     interval not null default '17:00',
  created_by        uuid references auth.users on delete set null,
  created_at        timestamptz not null default now()
);

-- A member may exist without an app account (user_id null); they can claim it later with claim_code.
create table public.mess_members (
  id                uuid primary key default gen_random_uuid(),
  mess_id           uuid not null references public.messes on delete cascade,
  user_id           uuid references auth.users on delete set null,
  display_name      text not null check (length(trim(display_name)) > 0),
  phone             text,
  role              public.member_role not null default 'member',
  room              text,
  status            public.member_status not null default 'active',
  joined_on         date not null default public.today_dhaka(),
  left_on           date,
  default_breakfast boolean not null default false,
  default_lunch     boolean not null default true,
  default_dinner    boolean not null default true,
  claim_code        text unique default public.random_code(),
  created_at        timestamptz not null default now(),
  unique (mess_id, user_id),
  check (left_on is null or left_on >= joined_on)
);
create index on public.mess_members (user_id);

create table public.meals (
  id              uuid primary key default gen_random_uuid(),
  mess_id         uuid not null references public.messes on delete cascade,
  member_id       uuid not null references public.mess_members on delete cascade,
  date            date not null,
  breakfast       boolean not null default false,
  lunch           boolean not null default false,
  dinner          boolean not null default false,
  guest_breakfast smallint not null default 0 check (guest_breakfast between 0 and 20),
  guest_lunch     smallint not null default 0 check (guest_lunch between 0 and 20),
  guest_dinner    smallint not null default 0 check (guest_dinner between 0 and 20),
  source          public.meal_source not null default 'auto',
  updated_by      uuid references auth.users on delete set null,
  updated_at      timestamptz not null default now(),
  unique (member_id, date)
);
create index on public.meals (mess_id, date);

create table public.bazar_entries (
  id           uuid primary key default gen_random_uuid(),
  mess_id      uuid not null references public.messes on delete cascade,
  date         date not null default public.today_dhaka(),
  shopper_id   uuid references public.mess_members on delete set null,
  amount       numeric(12,2) not null check (amount > 0),
  items        text,
  receipt_path text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.bazar_entries (mess_id, date);

-- month = first day of the month
create table public.fixed_costs (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  month      date not null check (extract(day from month) = 1),
  category   text not null default 'other',
  title      text not null,
  amount     numeric(12,2) not null check (amount > 0),
  split_type public.split_type not null default 'equal',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.fixed_costs (mess_id, month);

create table public.fixed_cost_shares (
  fixed_cost_id uuid not null references public.fixed_costs on delete cascade,
  mess_id       uuid not null references public.messes on delete cascade,
  member_id     uuid not null references public.mess_members on delete cascade,
  amount        numeric(12,2) not null check (amount >= 0),
  primary key (fixed_cost_id, member_id)
);

create table public.deposits (
  id          uuid primary key default gen_random_uuid(),
  mess_id     uuid not null references public.messes on delete cascade,
  member_id   uuid not null references public.mess_members on delete cascade,
  date        date not null default public.today_dhaka(),
  amount      numeric(12,2) not null check (amount > 0),
  method      public.payment_method not null default 'cash',
  txn_id      text,
  note        text,
  status      public.deposit_status not null default 'pending',
  created_by  uuid references auth.users on delete set null,
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.deposits (mess_id, date);

create table public.months (
  id             uuid primary key default gen_random_uuid(),
  mess_id        uuid not null references public.messes on delete cascade,
  month          date not null check (extract(day from month) = 1),
  status         public.month_status not null default 'open',
  total_bazar    numeric(12,2) not null default 0,
  total_meals    numeric(12,2) not null default 0,
  meal_rate      numeric(12,4) not null default 0,
  total_fixed    numeric(12,2) not null default 0,
  total_deposits numeric(12,2) not null default 0,
  closed_at      timestamptz,
  closed_by      uuid references auth.users on delete set null,
  unique (mess_id, month)
);

create table public.member_month_bills (
  month_id      uuid not null references public.months on delete cascade,
  mess_id       uuid not null references public.messes on delete cascade,
  member_id     uuid not null references public.mess_members on delete cascade,
  meals         numeric(12,2) not null,
  meal_cost     numeric(12,2) not null,
  fixed_share   numeric(12,2) not null,
  deposits      numeric(12,2) not null,
  carry_in      numeric(12,2) not null,
  final_balance numeric(12,2) not null,
  primary key (month_id, member_id)
);

create table public.notices (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  title      text not null,
  body       text,
  pinned     boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  mess_id    uuid, -- no FK: rows are written while a mess is being deleted
  actor_id   uuid,
  table_name text not null,
  row_id     text,
  action     text not null,
  old        jsonb,
  new        jsonb,
  at         timestamptz not null default now()
);
create index on public.audit_log (mess_id, at desc);

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'bn' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.my_role(p_mess uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.mess_members
  where mess_id = p_mess and user_id = auth.uid() and status = 'active'
  limit 1
$$;

create function public.is_member(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mess_members where mess_id = p_mess and user_id = auth.uid())
$$;

create function public.is_staff(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(p_mess) in ('manager', 'assistant'), false)
$$;

create function public.is_manager(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(p_mess) = 'manager', false)
$$;

-- ---------------------------------------------------------------------------
-- Closed-month guard + audit log
-- ---------------------------------------------------------------------------
create function public.assert_month_open(p_mess uuid, p_date date) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.months
    where mess_id = p_mess and month = date_trunc('month', p_date)::date and status = 'closed'
  ) then
    raise exception 'MONTH_CLOSED';
  end if;
end $$;

create function public.guard_closed_month() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if tg_op <> 'INSERT' then
    r := to_jsonb(old);
    perform public.assert_month_open((r ->> 'mess_id')::uuid, coalesce(r ->> 'date', r ->> 'month')::date);
  end if;
  if tg_op <> 'DELETE' then
    r := to_jsonb(new);
    perform public.assert_month_open((r ->> 'mess_id')::uuid, coalesce(r ->> 'date', r ->> 'month')::date);
    return new;
  end if;
  return old;
end $$;

create trigger guard_month before insert or update or delete on public.meals
  for each row execute function public.guard_closed_month();
create trigger guard_month before insert or update or delete on public.bazar_entries
  for each row execute function public.guard_closed_month();
create trigger guard_month before insert or update or delete on public.deposits
  for each row execute function public.guard_closed_month();
create trigger guard_month before insert or update or delete on public.fixed_costs
  for each row execute function public.guard_closed_month();

create function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  -- automatic meal generation would flood the log
  if tg_table_name = 'meals' and tg_op = 'INSERT' and v_new ->> 'source' = 'auto' then
    return null;
  end if;
  insert into public.audit_log (mess_id, actor_id, table_name, row_id, action, old, new)
  values (
    coalesce(v_row ->> 'mess_id', v_row ->> 'id')::uuid,
    auth.uid(), tg_table_name, v_row ->> 'id', lower(tg_op), v_old, v_new
  );
  return null;
end $$;

create trigger audit after insert or update or delete on public.meals
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.bazar_entries
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.deposits
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.fixed_costs
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.mess_members
  for each row execute function public.audit_trigger();
create trigger audit after update on public.messes
  for each row execute function public.audit_trigger();
create trigger audit after insert or update or delete on public.months
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.messes             enable row level security;
alter table public.mess_members       enable row level security;
alter table public.meals              enable row level security;
alter table public.bazar_entries      enable row level security;
alter table public.fixed_costs        enable row level security;
alter table public.fixed_cost_shares  enable row level security;
alter table public.deposits           enable row level security;
alter table public.months             enable row level security;
alter table public.member_month_bills enable row level security;
alter table public.notices            enable row level security;
alter table public.audit_log          enable row level security;

-- profiles: self, and people who share a mess with me
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.mess_members a
    join public.mess_members b on a.mess_id = b.mess_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- messes: created via create_mess(); manager edits settings
create policy messes_select on public.messes for select to authenticated using (public.is_member(id));
create policy messes_update on public.messes for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));

-- members: everyone in the mess can read; manager writes
create policy members_select on public.mess_members for select to authenticated using (public.is_member(mess_id));
create policy members_insert on public.mess_members for insert to authenticated with check (public.is_manager(mess_id));
create policy members_update on public.mess_members for update to authenticated
  using (public.is_manager(mess_id)) with check (public.is_manager(mess_id));
create policy members_delete on public.mess_members for delete to authenticated using (public.is_manager(mess_id));

-- meals: read for all members; writes only through set_meal() / set_meal_range()
create policy meals_select on public.meals for select to authenticated using (public.is_member(mess_id));

-- bazar: read for all; staff writes
create policy bazar_select on public.bazar_entries for select to authenticated using (public.is_member(mess_id));
create policy bazar_insert on public.bazar_entries for insert to authenticated with check (public.is_staff(mess_id));
create policy bazar_update on public.bazar_entries for update to authenticated
  using (public.is_staff(mess_id)) with check (public.is_staff(mess_id));
create policy bazar_delete on public.bazar_entries for delete to authenticated using (public.is_staff(mess_id));

-- fixed costs: read for all; manager writes (shares via add_fixed_cost())
create policy fixed_select on public.fixed_costs for select to authenticated using (public.is_member(mess_id));
create policy fixed_delete on public.fixed_costs for delete to authenticated using (public.is_manager(mess_id));
create policy shares_select on public.fixed_cost_shares for select to authenticated using (public.is_member(mess_id));

-- deposits: read for all; staff records/approves; a member may submit their own as pending
create policy deposits_select on public.deposits for select to authenticated using (public.is_member(mess_id));
create policy deposits_insert on public.deposits for insert to authenticated with check (
  public.is_staff(mess_id)
  or (
    status = 'pending'
    and reviewed_by is null
    and exists (
      select 1 from public.mess_members m
      where m.id = member_id and m.mess_id = deposits.mess_id and m.user_id = auth.uid()
    )
  )
);
create policy deposits_update on public.deposits for update to authenticated
  using (public.is_staff(mess_id)) with check (public.is_staff(mess_id));
create policy deposits_delete on public.deposits for delete to authenticated using (
  public.is_manager(mess_id)
  or (status = 'pending' and created_by = auth.uid())
);

-- months & bills: read only; written by close_month()/reopen_month()
create policy months_select on public.months for select to authenticated using (public.is_member(mess_id));
create policy bills_select on public.member_month_bills for select to authenticated using (public.is_member(mess_id));

-- notices
create policy notices_select on public.notices for select to authenticated using (public.is_member(mess_id));
create policy notices_insert on public.notices for insert to authenticated with check (public.is_staff(mess_id));
create policy notices_update on public.notices for update to authenticated
  using (public.is_staff(mess_id)) with check (public.is_staff(mess_id));
create policy notices_delete on public.notices for delete to authenticated using (public.is_staff(mess_id));

-- audit: transparent to all members
create policy audit_select on public.audit_log for select to authenticated using (public.is_member(mess_id));

-- ---------------------------------------------------------------------------
-- RPC: mess lifecycle
-- ---------------------------------------------------------------------------
create function public.create_mess(p_name text, p_address text default null, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mess uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select coalesce(nullif(trim(p_display_name), ''), nullif(full_name, ''), 'Manager')
    into v_name from public.profiles where id = auth.uid();
  insert into public.messes (name, address, created_by)
    values (trim(p_name), p_address, auth.uid()) returning id into v_mess;
  insert into public.mess_members (mess_id, user_id, display_name, role, claim_code)
    values (v_mess, auth.uid(), coalesce(v_name, 'Manager'), 'manager', null);
  return v_mess;
end $$;

-- p_code may be the mess invite code (new member) or a member claim code (link existing member)
create function public.join_mess(p_code text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mess uuid; v_member public.mess_members; v_name text; v_code text := upper(trim(p_code));
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_member from public.mess_members where claim_code = v_code and user_id is null;
  if found then
    if exists (select 1 from public.mess_members where mess_id = v_member.mess_id and user_id = auth.uid()) then
      raise exception 'ALREADY_MEMBER';
    end if;
    update public.mess_members set user_id = auth.uid(), claim_code = null where id = v_member.id;
    return v_member.mess_id;
  end if;

  select id into v_mess from public.messes where invite_code = v_code;
  if v_mess is null then raise exception 'INVALID_CODE'; end if;
  if exists (select 1 from public.mess_members where mess_id = v_mess and user_id = auth.uid()) then
    return v_mess;
  end if;

  select coalesce(nullif(trim(p_display_name), ''), nullif(full_name, ''), 'Member')
    into v_name from public.profiles where id = auth.uid();
  insert into public.mess_members (mess_id, user_id, display_name, claim_code)
    values (v_mess, auth.uid(), coalesce(v_name, 'Member'), null);
  return v_mess;
end $$;

create function public.regenerate_invite_code(p_mess uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;
  update public.messes set invite_code = public.random_code() where id = p_mess returning invite_code into v_code;
  return v_code;
end $$;

-- members can change their own default meal pattern
create function public.update_my_defaults(p_mess uuid, p_breakfast boolean, p_lunch boolean, p_dinner boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mess_members
     set default_breakfast = p_breakfast, default_lunch = p_lunch, default_dinner = p_dinner
   where mess_id = p_mess and user_id = auth.uid();
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;


-- ---------------------------------------------------------------------------
-- RPC: meals
-- ---------------------------------------------------------------------------
-- Creates the day's meal rows from each member's default pattern.
-- Idempotent: rows that already exist (e.g. a member turned a future meal off) are kept.
create function public.generate_daily_meals(p_date date default public.today_dhaka(), p_mess uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.meals (mess_id, member_id, date, breakfast, lunch, dinner, source)
  select mm.mess_id, mm.id, p_date,
         mm.default_breakfast and ms.breakfast_enabled, mm.default_lunch, mm.default_dinner, 'auto'
    from public.mess_members mm
    join public.messes ms on ms.id = mm.mess_id
   where (p_mess is null or mm.mess_id = p_mess)
     and mm.joined_on <= p_date
     and (mm.left_on is null or mm.left_on >= p_date)
     and not exists (
       select 1 from public.months mo
        where mo.mess_id = mm.mess_id
          and mo.month = date_trunc('month', p_date)::date
          and mo.status = 'closed'
     )
  on conflict (member_id, date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.generate_daily_meals(date, uuid) from public, anon, authenticated;
grant execute on function public.generate_daily_meals(date, uuid) to service_role;

-- Called by the app on open: fills any days the nightly job missed (current month up to today).
create function public.ensure_meals(p_mess uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare d date; v_total integer := 0; v_n integer;
begin
  if not public.is_member(p_mess) then raise exception 'FORBIDDEN'; end if;
  for d in
    select generate_series(date_trunc('month', public.today_dhaka()), public.today_dhaka(), interval '1 day')::date
  loop
    v_n := public.generate_daily_meals(d, p_mess);
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;

-- Change one member's meals for one date. NULL params = leave unchanged.
-- Members may only change their own meals before the cutoff; manager/assistant can change anything.
create function public.set_meal(
  p_member uuid, p_date date,
  p_breakfast boolean default null, p_lunch boolean default null, p_dinner boolean default null,
  p_guest_breakfast integer default null, p_guest_lunch integer default null, p_guest_dinner integer default null
) returns public.meals
language plpgsql security definer set search_path = '' as $$
declare
  m public.mess_members;
  ms public.messes;
  v_staff boolean;
  v_now timestamp := now() at time zone 'Asia/Dhaka';
  v_active boolean;
  v_row public.meals;
begin
  select * into m from public.mess_members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  select * into ms from public.messes where id = m.mess_id;
  v_staff := public.is_staff(m.mess_id);

  if not v_staff then
    if m.user_id is distinct from auth.uid() or m.status <> 'active' then
      raise exception 'FORBIDDEN';
    end if;
    if (p_breakfast is not null or p_guest_breakfast is not null) and v_now >= p_date + ms.breakfast_cutoff then
      raise exception 'CUTOFF_PASSED';
    end if;
    if (p_lunch is not null or p_guest_lunch is not null) and v_now >= p_date + ms.lunch_cutoff then
      raise exception 'CUTOFF_PASSED';
    end if;
    if (p_dinner is not null or p_guest_dinner is not null) and v_now >= p_date + ms.dinner_cutoff then
      raise exception 'CUTOFF_PASSED';
    end if;
  end if;

  if p_breakfast and not ms.breakfast_enabled then raise exception 'BREAKFAST_DISABLED'; end if;

  v_active := m.joined_on <= p_date and (m.left_on is null or m.left_on >= p_date);

  insert into public.meals (mess_id, member_id, date, breakfast, lunch, dinner, source)
  values (
    m.mess_id, m.id, p_date,
    v_active and m.default_breakfast and ms.breakfast_enabled,
    v_active and m.default_lunch,
    v_active and m.default_dinner,
    'auto'
  )
  on conflict (member_id, date) do nothing;

  update public.meals set
    breakfast       = coalesce(p_breakfast, breakfast),
    lunch           = coalesce(p_lunch, lunch),
    dinner          = coalesce(p_dinner, dinner),
    guest_breakfast = coalesce(p_guest_breakfast, guest_breakfast),
    guest_lunch     = coalesce(p_guest_lunch, guest_lunch),
    guest_dinner    = coalesce(p_guest_dinner, guest_dinner),
    source          = case when m.user_id = auth.uid() then 'member'::public.meal_source
                           else 'manager'::public.meal_source end,
    updated_by      = auth.uid(),
    updated_at      = now()
  where member_id = m.id and date = p_date
  returning * into v_row;

  return v_row;
end $$;

-- Set meals for a date range (e.g. going home for Eid). Max 62 days.
create function public.set_meal_range(
  p_member uuid, p_from date, p_to date,
  p_breakfast boolean default null, p_lunch boolean default null, p_dinner boolean default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare d date; v_n integer := 0;
begin
  if p_to < p_from or p_to - p_from > 61 then raise exception 'INVALID_RANGE'; end if;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    perform public.set_meal(p_member, d, p_breakfast, p_lunch, p_dinner);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: fixed costs
-- ---------------------------------------------------------------------------
-- p_shares (custom split only): [{"member_id": "...", "amount": 1234.00}, ...]
create function public.add_fixed_cost(
  p_mess uuid, p_month date, p_category text, p_title text, p_amount numeric,
  p_split public.split_type default 'equal', p_shares jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_id uuid;
  v_count integer;
  v_each numeric(12,2);
  v_sum numeric(12,2);
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;

  insert into public.fixed_costs (mess_id, month, category, title, amount, split_type, created_by)
  values (p_mess, v_month, coalesce(nullif(p_category, ''), 'other'), p_title, p_amount, p_split, auth.uid())
  returning id into v_id;

  if p_split = 'equal' then
    select count(*) into v_count from public.mess_members
     where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_month);
    if v_count = 0 then raise exception 'NO_MEMBERS'; end if;
    v_each := floor(p_amount / v_count * 100) / 100;

    insert into public.fixed_cost_shares (fixed_cost_id, mess_id, member_id, amount)
    select v_id, p_mess, id,
           -- first member absorbs the rounding remainder so shares sum exactly to the total
           v_each + case when row_number() over (order by joined_on, id) = 1
                         then p_amount - v_each * v_count else 0 end
      from public.mess_members
     where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_month);
  else
    insert into public.fixed_cost_shares (fixed_cost_id, mess_id, member_id, amount)
    select v_id, p_mess, (s ->> 'member_id')::uuid, (s ->> 'amount')::numeric
      from jsonb_array_elements(coalesce(p_shares, '[]'::jsonb)) s
     where exists (select 1 from public.mess_members m where m.id = (s ->> 'member_id')::uuid and m.mess_id = p_mess);

    select coalesce(sum(amount), 0) into v_sum from public.fixed_cost_shares where fixed_cost_id = v_id;
    if v_sum <> p_amount then raise exception 'SHARES_MISMATCH'; end if;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: monthly summary & closing
-- ---------------------------------------------------------------------------
-- Per-member live balance:
--   meal_cost = weighted meals × meal_rate,  meal_rate = total bazar ÷ total weighted meals
--   balance   = carry_in + approved deposits − meal_cost − fixed share
-- Positive = mess owes the member; negative = member owes the mess.
create function public.month_summary(p_mess uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev  date := (date_trunc('month', p_month) - interval '1 month')::date;
  -- meals pre-set for future days don't count yet
  v_meal_end date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, public.today_dhaka());
  ms public.messes;
  mo public.months;
  v_prev_closed boolean;
  v_bazar numeric;
  v_meals numeric;
  v_rate numeric;
  v_members jsonb;
begin
  if not public.is_member(p_mess) then raise exception 'FORBIDDEN'; end if;
  select * into ms from public.messes where id = p_mess;
  select * into mo from public.months where mess_id = p_mess and month = v_start;

  -- closed month: return frozen figures
  if mo.id is not null and mo.status = 'closed' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'member_id', b.member_id, 'display_name', m.display_name, 'room', m.room,
             'meals', b.meals, 'meal_cost', b.meal_cost, 'fixed_share', b.fixed_share,
             'deposits', b.deposits, 'carry_in', b.carry_in, 'balance', b.final_balance
           ) order by m.display_name), '[]'::jsonb)
      into v_members
      from public.member_month_bills b join public.mess_members m on m.id = b.member_id
     where b.month_id = mo.id;

    return jsonb_build_object(
      'month', v_start, 'status', 'closed', 'closed_at', mo.closed_at,
      'total_bazar', mo.total_bazar, 'total_meals', mo.total_meals, 'meal_rate', round(mo.meal_rate, 2),
      'total_fixed', mo.total_fixed, 'total_deposits', mo.total_deposits,
      'prev_month_closed', true, 'members', v_members
    );
  end if;

  select exists (select 1 from public.months where mess_id = p_mess and month = v_prev and status = 'closed')
    into v_prev_closed;

  select coalesce(sum(amount), 0) into v_bazar
    from public.bazar_entries where mess_id = p_mess and date between v_start and v_end;

  select coalesce(sum(
           (ml.breakfast::int + ml.guest_breakfast) * ms.breakfast_weight
         + (ml.lunch::int     + ml.guest_lunch)     * ms.lunch_weight
         + (ml.dinner::int    + ml.guest_dinner)    * ms.dinner_weight), 0)
    into v_meals
    from public.meals ml where ml.mess_id = p_mess and ml.date between v_start and v_meal_end;

  v_rate := case when v_meals > 0 then v_bazar / v_meals else 0 end;

  with per_member as (
    select m.id, m.display_name, m.room,
      coalesce((select sum(
                  (ml.breakfast::int + ml.guest_breakfast) * ms.breakfast_weight
                + (ml.lunch::int     + ml.guest_lunch)     * ms.lunch_weight
                + (ml.dinner::int    + ml.guest_dinner)    * ms.dinner_weight)
                from public.meals ml
               where ml.member_id = m.id and ml.date between v_start and v_meal_end), 0) as meals,
      coalesce((select sum(s.amount) from public.fixed_cost_shares s
                  join public.fixed_costs f on f.id = s.fixed_cost_id
                 where s.member_id = m.id and f.month = v_start), 0) as fixed_share,
      coalesce((select sum(d.amount) from public.deposits d
                 where d.member_id = m.id and d.status = 'approved'
                   and d.date between v_start and v_end), 0) as deposits,
      coalesce((select b.final_balance from public.member_month_bills b
                  join public.months pm on pm.id = b.month_id
                 where b.member_id = m.id and pm.month = v_prev and pm.status = 'closed'), 0) as carry_in
    from public.mess_members m
    where m.mess_id = p_mess
  ),
  computed as (
    select *, round(meals * v_rate, 2) as meal_cost from per_member
    where meals <> 0 or fixed_share <> 0 or deposits <> 0 or carry_in <> 0
       or id in (select id from public.mess_members
                  where mess_id = p_mess and joined_on <= v_end and (left_on is null or left_on >= v_start))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', id, 'display_name', display_name, 'room', room,
           'meals', meals, 'meal_cost', meal_cost, 'fixed_share', fixed_share,
           'deposits', deposits, 'carry_in', carry_in,
           'balance', carry_in + deposits - meal_cost - fixed_share
         ) order by display_name), '[]'::jsonb)
    into v_members from computed;

  return jsonb_build_object(
    'month', v_start, 'status', 'open', 'closed_at', null,
    'total_bazar', v_bazar, 'total_meals', v_meals, 'meal_rate', round(v_rate, 2),
    'total_fixed', (select coalesce(sum(amount), 0) from public.fixed_costs
                     where mess_id = p_mess and month = v_start),
    'total_deposits', (select coalesce(sum(amount), 0) from public.deposits
                        where mess_id = p_mess and status = 'approved' and date between v_start and v_end),
    'prev_month_closed', v_prev_closed,
    'members', v_members
  );
end $$;

create function public.close_month(p_mess uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_sum jsonb;
  v_month_id uuid;
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;
  if v_start > date_trunc('month', public.today_dhaka())::date then raise exception 'FUTURE_MONTH'; end if;
  if exists (select 1 from public.months where mess_id = p_mess and month = v_start and status = 'closed') then
    raise exception 'MONTH_CLOSED';
  end if;

  v_sum := public.month_summary(p_mess, v_start);

  insert into public.months (mess_id, month, status, total_bazar, total_meals, meal_rate,
                             total_fixed, total_deposits, closed_at, closed_by)
  values (p_mess, v_start, 'closed',
          (v_sum ->> 'total_bazar')::numeric, (v_sum ->> 'total_meals')::numeric,
          case when (v_sum ->> 'total_meals')::numeric > 0
               then (v_sum ->> 'total_bazar')::numeric / (v_sum ->> 'total_meals')::numeric else 0 end,
          (v_sum ->> 'total_fixed')::numeric, (v_sum ->> 'total_deposits')::numeric, now(), auth.uid())
  on conflict (mess_id, month) do update set
    status = 'closed', total_bazar = excluded.total_bazar, total_meals = excluded.total_meals,
    meal_rate = excluded.meal_rate, total_fixed = excluded.total_fixed,
    total_deposits = excluded.total_deposits, closed_at = now(), closed_by = auth.uid()
  returning id into v_month_id;

  delete from public.member_month_bills where month_id = v_month_id;
  insert into public.member_month_bills
    (month_id, mess_id, member_id, meals, meal_cost, fixed_share, deposits, carry_in, final_balance)
  select v_month_id, p_mess, (x ->> 'member_id')::uuid,
         (x ->> 'meals')::numeric, (x ->> 'meal_cost')::numeric, (x ->> 'fixed_share')::numeric,
         (x ->> 'deposits')::numeric, (x ->> 'carry_in')::numeric, (x ->> 'balance')::numeric
    from jsonb_array_elements(v_sum -> 'members') x;

  return public.month_summary(p_mess, v_start);
end $$;

create function public.reopen_month(p_mess uuid, p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_start date := date_trunc('month', p_month)::date;
begin
  if not public.is_manager(p_mess) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.months where mess_id = p_mess
               and month = (v_start + interval '1 month')::date and status = 'closed') then
    raise exception 'NEXT_MONTH_CLOSED';
  end if;
  delete from public.member_month_bills b using public.months mo
   where b.month_id = mo.id and mo.mess_id = p_mess and mo.month = v_start;
  update public.months set status = 'open', closed_at = null, closed_by = null
   where mess_id = p_mess and month = v_start;
end $$;

-- ---------------------------------------------------------------------------
-- Nightly job: 18:05 UTC = 00:05 Asia/Dhaka
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'messflow-daily-meals',
  '5 18 * * *',
  $$ select public.generate_daily_meals(public.today_dhaka()) $$
);

-- ---------------------------------------------------------------------------
-- Explicit API grants (RLS above still decides which rows are visible)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.generate_daily_meals(date, uuid) from public, anon, authenticated;
