-- MessFlow: backup log + app-wide reminders.
-- `pnpm db:backup` adds a line here, so the admin panel can show "last backup: 3 days ago" and the
-- app can remind the super admin when it's been more than a week.

create table private.backup_log (
  id       bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  label    text,
  size_kb  integer
);

-- reminders that aren't tied to one mess (sent at most once per key)
create table private.reminder_log (
  kind    text not null,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, key)
);

-- when the last backup was taken (super admin or the server only)
create function public.last_backup() returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then return null; end if;
  return (select max(taken_at) from private.backup_log);
end $$;
revoke execute on function public.last_backup() from public, anon;
grant execute on function public.last_backup() to authenticated, service_role;

-- server only: true the first time a (kind, key) is claimed, false after that
create function public.claim_reminder(p_kind text, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.reminder_log (kind, key) values (p_kind, p_key) on conflict do nothing;
  return found;
end $$;
revoke execute on function public.claim_reminder(text, text) from public, anon, authenticated;
grant execute on function public.claim_reminder(text, text) to service_role;
