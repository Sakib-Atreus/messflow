-- MessFlow: super admin, approvals, custom roles, admin-created accounts
--
-- * profiles.is_super_admin  — platform owner; sees and can do everything
-- * mess_requests            — self sign-ups ask the super admin for a new mess
-- * join_requests            — invite-code joins wait for the mess (members permission) to approve
-- * mess_roles               — per-mess custom roles with a permission list
-- * profiles.must_change_password — set for accounts created with a temporary password
--
-- Permissions: meals, bazar, deposits, costs, members, roster, notices, month, settings.
-- A manager has all of them; a member has those of their custom role (if any).

-- ---------------------------------------------------------------------------
-- Profiles: platform flags. Users may only edit their personal fields.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column is_super_admin       boolean not null default false,
  add column must_change_password boolean not null default false,
  add column username             text unique check (username ~ '^[a-z0-9_.]{3,30}$');

revoke update on public.profiles from authenticated;
grant update (full_name, phone, locale, notify_prefs) on public.profiles to authenticated;

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
$$;

-- Accounts created by an admin carry these flags in app metadata (only the service role can set it).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone, locale, username, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'bn' end,
    new.raw_app_meta_data ->> 'username',
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end $$;

-- Called after the user has set their own password.
create function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Custom roles
-- ---------------------------------------------------------------------------
create table public.mess_roles (
  id          uuid primary key default gen_random_uuid(),
  mess_id     uuid not null references public.messes on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  permissions text[] not null default '{}' check (
    permissions <@ array['meals','bazar','deposits','costs','members','roster','notices','month','settings']::text[]
  ),
  created_at  timestamptz not null default now(),
  unique (mess_id, name)
);

alter table public.mess_members add column role_id uuid references public.mess_roles on delete set null;
create index on public.mess_members (role_id);

-- old built-in "assistant" becomes a custom role with the same powers
insert into public.mess_roles (mess_id, name, permissions)
select distinct mess_id, 'Assistant', array['meals','bazar','deposits','notices','roster']
  from public.mess_members where role = 'assistant';
update public.mess_members m set role = 'member', role_id = r.id
  from public.mess_roles r where r.mess_id = m.mess_id and r.name = 'Assistant' and m.role = 'assistant';

create function public.has_perm(p_mess uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.mess_members m
      left join public.mess_roles r on r.id = m.role_id
     where m.mess_id = p_mess and m.user_id = auth.uid() and m.status = 'active'
       and (m.role = 'manager' or p_perm = any (r.permissions))
  )
$$;

-- My permissions in a mess (for the UI). Managers / super admin get all.
create function public.my_permissions(p_mess uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_super_admin() or public.my_role(p_mess) = 'manager'
      then array['meals','bazar','deposits','costs','members','roster','notices','month','settings']
    else coalesce((
      select r.permissions from public.mess_members m join public.mess_roles r on r.id = m.role_id
       where m.mess_id = p_mess and m.user_id = auth.uid() and m.status = 'active' limit 1
    ), '{}')
  end
$$;

create or replace function public.is_member(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or exists (select 1 from public.mess_members where mess_id = p_mess and user_id = auth.uid())
$$;

create or replace function public.is_manager(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or coalesce(public.my_role(p_mess) = 'manager', false)
$$;

-- no longer used by policies; kept so nothing that still calls it breaks
create or replace function public.is_staff(p_mess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_manager(p_mess)
$$;

-- Only a manager may hand out roles; role_id must belong to the same mess.
create function public.guard_member_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (
       (tg_op = 'INSERT' and (new.role <> 'member' or new.role_id is not null))
    or (tg_op = 'UPDATE' and (new.role is distinct from old.role or new.role_id is distinct from old.role_id))
  ) and not public.is_manager(new.mess_id) then
    raise exception 'FORBIDDEN';
  end if;
  if new.role_id is not null and not exists (
    select 1 from public.mess_roles where id = new.role_id and mess_id = new.mess_id
  ) then
    raise exception 'INVALID_INPUT';
  end if;
  return new;
end $$;

create trigger guard_role before insert or update on public.mess_members
  for each row execute function public.guard_member_role();

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
create table public.mess_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  address      text,
  display_name text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  mess_id      uuid references public.messes on delete set null,
  reviewed_by  uuid references auth.users on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index on public.mess_requests (user_id) where status = 'pending';

create table public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  mess_id      uuid not null references public.messes on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  display_name text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references auth.users on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index on public.join_requests (mess_id, user_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.mess_roles    enable row level security;
alter table public.mess_requests enable row level security;
alter table public.join_requests enable row level security;

create policy roles_select on public.mess_roles for select to authenticated using (public.is_member(mess_id));
create policy roles_insert on public.mess_roles for insert to authenticated with check (public.is_manager(mess_id));
create policy roles_update on public.mess_roles for update to authenticated
  using (public.is_manager(mess_id)) with check (public.is_manager(mess_id));
create policy roles_delete on public.mess_roles for delete to authenticated using (public.is_manager(mess_id));

create policy mess_requests_select on public.mess_requests for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy join_requests_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.has_perm(mess_id, 'members'));

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_super_admin() or exists (
    select 1 from public.mess_members a
    join public.mess_members b on a.mess_id = b.mess_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  ) or exists (
    select 1 from public.join_requests j
    where j.user_id = profiles.id and j.status = 'pending' and public.has_perm(j.mess_id, 'members')
  )
);

-- permission-based policies (replace manager/staff checks)
drop policy messes_update on public.messes;
create policy messes_update on public.messes for update to authenticated
  using (public.has_perm(id, 'settings')) with check (public.has_perm(id, 'settings'));

drop policy members_insert on public.mess_members;
drop policy members_update on public.mess_members;
create policy members_insert on public.mess_members for insert to authenticated
  with check (public.has_perm(mess_id, 'members'));
create policy members_update on public.mess_members for update to authenticated
  using (public.has_perm(mess_id, 'members')) with check (public.has_perm(mess_id, 'members'));

drop policy bazar_insert on public.bazar_entries;
drop policy bazar_update on public.bazar_entries;
drop policy bazar_delete on public.bazar_entries;
create policy bazar_insert on public.bazar_entries for insert to authenticated with check (public.has_perm(mess_id, 'bazar'));
create policy bazar_update on public.bazar_entries for update to authenticated
  using (public.has_perm(mess_id, 'bazar')) with check (public.has_perm(mess_id, 'bazar'));
create policy bazar_delete on public.bazar_entries for delete to authenticated using (public.has_perm(mess_id, 'bazar'));

drop policy fixed_delete on public.fixed_costs;
create policy fixed_delete on public.fixed_costs for delete to authenticated using (public.has_perm(mess_id, 'costs'));

drop policy deposits_insert on public.deposits;
drop policy deposits_update on public.deposits;
drop policy deposits_delete on public.deposits;
create policy deposits_insert on public.deposits for insert to authenticated with check (
  public.has_perm(mess_id, 'deposits')
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
  using (public.has_perm(mess_id, 'deposits')) with check (public.has_perm(mess_id, 'deposits'));
create policy deposits_delete on public.deposits for delete to authenticated using (
  public.has_perm(mess_id, 'deposits')
  or (status = 'pending' and created_by = auth.uid())
);

drop policy notices_insert on public.notices;
drop policy notices_update on public.notices;
drop policy notices_delete on public.notices;
create policy notices_insert on public.notices for insert to authenticated with check (public.has_perm(mess_id, 'notices'));
create policy notices_update on public.notices for update to authenticated
  using (public.has_perm(mess_id, 'notices')) with check (public.has_perm(mess_id, 'notices'));
create policy notices_delete on public.notices for delete to authenticated using (public.has_perm(mess_id, 'notices'));

drop policy roster_insert on public.bazar_roster;
drop policy roster_update on public.bazar_roster;
drop policy roster_delete on public.bazar_roster;
create policy roster_insert on public.bazar_roster for insert to authenticated with check (public.has_perm(mess_id, 'roster'));
create policy roster_update on public.bazar_roster for update to authenticated
  using (public.has_perm(mess_id, 'roster')) with check (public.has_perm(mess_id, 'roster'));
create policy roster_delete on public.bazar_roster for delete to authenticated using (public.has_perm(mess_id, 'roster'));

-- ---------------------------------------------------------------------------
-- Existing RPCs: swap manager/staff checks for specific permissions.
-- Each patch fails loudly if the text it expects is missing.
-- ---------------------------------------------------------------------------
create function pg_temp.patch(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch: "%" not found in %', p_from, p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;

select pg_temp.patch('public.regenerate_invite_code(uuid)',
  'public.is_manager(p_mess)', 'public.has_perm(p_mess, ''settings'')');
select pg_temp.patch('public.set_meal(uuid, date, boolean, boolean, boolean, integer, integer, integer)',
  'public.is_staff(m.mess_id)', 'public.has_perm(m.mess_id, ''meals'')');
select pg_temp.patch('public.add_fixed_cost(uuid, date, text, text, numeric, public.split_type, jsonb)',
  'public.is_manager(p_mess)', 'public.has_perm(p_mess, ''costs'')');
select pg_temp.patch('public.close_month(uuid, date)',
  'public.is_manager(p_mess)', 'public.has_perm(p_mess, ''month'')');
select pg_temp.patch('public.reopen_month(uuid, date)',
  'public.is_manager(p_mess)', 'public.has_perm(p_mess, ''month'')');
select pg_temp.patch('public.generate_roster(uuid, uuid[], date, date, integer, integer)',
  'public.is_staff(p_mess)', 'public.has_perm(p_mess, ''roster'')');
select pg_temp.patch('public.swap_duty(uuid, uuid)',
  'public.is_staff(a.mess_id)', 'public.has_perm(a.mess_id, ''roster'')');

-- ---------------------------------------------------------------------------
-- Mess creation is now super-admin only (directly, or by approving a request)
-- ---------------------------------------------------------------------------
revoke execute on function public.create_mess(text, text, text) from public, anon, authenticated;

create function public.admin_create_mess(p_name text, p_address text, p_manager uuid, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mess uuid; v_name text;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_manager) then raise exception 'INVALID_INPUT'; end if;
  select coalesce(nullif(trim(p_display_name), ''), nullif(full_name, ''), 'Manager')
    into v_name from public.profiles where id = p_manager;
  insert into public.messes (name, address, created_by)
    values (trim(p_name), nullif(trim(p_address), ''), p_manager) returning id into v_mess;
  insert into public.mess_members (mess_id, user_id, display_name, role, claim_code)
    values (v_mess, p_manager, v_name, 'manager', null);
  return v_mess;
end $$;

create function public.request_mess(p_name text, p_address text default null, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.mess_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'ALREADY_REQUESTED';
  end if;
  select coalesce(nullif(trim(p_display_name), ''), nullif(full_name, ''), 'Manager')
    into v_name from public.profiles where id = auth.uid();
  insert into public.mess_requests (user_id, name, address, display_name)
    values (auth.uid(), trim(p_name), nullif(trim(p_address), ''), v_name) returning id into v_id;
  return v_id;
end $$;

create function public.review_mess_request(p_id uuid, p_approve boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.mess_requests; v_mess uuid;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.mess_requests where id = p_id and status = 'pending' for update;
  if r.id is null then raise exception 'INVALID_INPUT'; end if;
  if p_approve then
    v_mess := public.admin_create_mess(r.name, r.address, r.user_id, r.display_name);
  end if;
  update public.mess_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         mess_id = v_mess, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  return v_mess;
end $$;

-- Invite code → join request (waits for approval). Claim code → links immediately (manager made that member).
create or replace function public.join_mess(p_code text, p_display_name text default null)
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
    raise exception 'ALREADY_MEMBER';
  end if;
  if exists (select 1 from public.join_requests where mess_id = v_mess and user_id = auth.uid() and status = 'pending') then
    raise exception 'ALREADY_REQUESTED';
  end if;

  select coalesce(nullif(trim(p_display_name), ''), nullif(full_name, ''), 'Member')
    into v_name from public.profiles where id = auth.uid();
  insert into public.join_requests (mess_id, user_id, display_name) values (v_mess, auth.uid(), v_name);
  return null;
end $$;

create function public.review_join_request(p_id uuid, p_approve boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.join_requests; v_member uuid;
begin
  select * into r from public.join_requests where id = p_id and status = 'pending' for update;
  if r.id is null then raise exception 'INVALID_INPUT'; end if;
  if not public.has_perm(r.mess_id, 'members') then raise exception 'FORBIDDEN'; end if;
  if p_approve then
    insert into public.mess_members (mess_id, user_id, display_name, claim_code)
      values (r.mess_id, r.user_id, r.display_name, null)
      on conflict (mess_id, user_id) do nothing
      returning id into v_member;
  end if;
  update public.join_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  return v_member;
end $$;

-- Platform numbers for the super admin dashboard.
create function public.platform_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'messes',        (select count(*) from public.messes),
    'users',         (select count(*) from public.profiles),
    'members',       (select count(*) from public.mess_members where status = 'active'),
    'mess_requests', (select count(*) from public.mess_requests where status = 'pending'),
    'join_requests', (select count(*) from public.join_requests where status = 'pending'),
    'meals_today',   (select coalesce(sum(breakfast::int + lunch::int + dinner::int
                                          + guest_breakfast + guest_lunch + guest_dinner), 0)
                        from public.meals where date = public.today_dhaka()),
    'bazar_month',   (select coalesce(sum(amount), 0) from public.bazar_entries
                       where date >= date_trunc('month', public.today_dhaka())::date)
  );
end $$;

-- Server-only lookup (service role) so the super admin can reuse an existing account as manager.
create function public.find_user_by_email(p_email text) returns table (id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select u.id from auth.users u where lower(u.email) = lower(trim(p_email));
end $$;
revoke execute on function public.find_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_by_email(text) to service_role;

create trigger audit after insert or update or delete on public.mess_roles
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.mess_roles to authenticated;
grant select on public.mess_requests, public.join_requests to authenticated;
grant all on public.mess_roles, public.mess_requests, public.join_requests to service_role;
revoke execute on function public.admin_create_mess(text, text, uuid, text), public.request_mess(text, text, text),
  public.review_mess_request(uuid, boolean), public.review_join_request(uuid, boolean), public.platform_stats(),
  public.password_changed(), public.has_perm(uuid, text), public.my_permissions(uuid), public.is_super_admin()
  from public, anon;
grant execute on function public.admin_create_mess(text, text, uuid, text), public.request_mess(text, text, text),
  public.review_mess_request(uuid, boolean), public.review_join_request(uuid, boolean), public.platform_stats(),
  public.password_changed(), public.has_perm(uuid, text), public.my_permissions(uuid), public.is_super_admin()
  to authenticated, service_role;
