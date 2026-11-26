-- MessFlow: "বাজারে লাগবে" - khala (or the manager) asks for things to buy: tap an item, write a
-- line or record a short voice message. Everyone in the mess sees the list; whoever buys it ticks it.

create table public.bazar_needs (
  id         uuid primary key default gen_random_uuid(),
  mess_id    uuid not null references public.messes on delete cascade,
  item       text check (item ~ '^[a-z_]{2,20}$'),         -- a known item key (oil, salt…), or null
  note       text check (length(note) <= 300),              -- free text
  voice_path text,                                          -- file in the "voice" bucket
  status     text not null default 'open' check (status in ('open', 'bought')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  bought_by  uuid references auth.users on delete set null,
  bought_at  timestamptz,
  check (item is not null or note is not null or voice_path is not null)
);
create index on public.bazar_needs (mess_id, status, created_at desc);
-- the same item can't be asked for twice while it's still waiting
create unique index bazar_needs_one_open on public.bazar_needs (mess_id, item) where status = 'open' and item is not null;
alter table public.bazar_needs enable row level security;
create policy bazar_needs_select on public.bazar_needs for select to authenticated
  using (public.is_member(mess_id) or public.is_cook(mess_id));
grant select on public.bazar_needs to authenticated;
grant all on public.bazar_needs to service_role;

-- Khala or the manager: ask for items (+ an optional line / voice message). Returns how many rows were added.
create function public.add_bazar_needs(p_mess uuid, p_items text[], p_note text default null, p_voice text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_new integer;
begin
  if not (public.is_cook(p_mess) or public.is_manager(p_mess)) then raise exception 'FORBIDDEN'; end if;
  if p_voice is not null and p_voice not like p_mess::text || '/%' then raise exception 'FORBIDDEN'; end if;
  insert into public.bazar_needs (mess_id, item, created_by)
  select p_mess, i, auth.uid() from unnest(coalesce(p_items, '{}')) i
  on conflict (mess_id, item) where status = 'open' and item is not null do nothing;
  get diagnostics v_n = row_count;
  if nullif(trim(p_note), '') is not null or p_voice is not null then
    insert into public.bazar_needs (mess_id, note, voice_path, created_by)
    values (p_mess, nullif(trim(left(p_note, 300)), ''), p_voice, auth.uid());
    v_n := v_n + 1;
  end if;
  return v_n;
end $$;

-- Anyone in the mess: "bought it".
create function public.mark_need_bought(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.bazar_needs;
begin
  select * into n from public.bazar_needs where id = p_id;
  if not found or not (public.is_member(n.mess_id) or public.is_cook(n.mess_id)) then raise exception 'FORBIDDEN'; end if;
  update public.bazar_needs set status = 'bought', bought_by = auth.uid(), bought_at = now() where id = p_id and status = 'open';
end $$;

revoke execute on function public.add_bazar_needs(uuid, text[], text, text) from public, anon;
revoke execute on function public.mark_need_bought(uuid) from public, anon;
grant execute on function public.add_bazar_needs(uuid, text[], text, text) to authenticated, service_role;
grant execute on function public.mark_need_bought(uuid) to authenticated, service_role;

-- Voice messages: private bucket, files under <mess id>/…. Khala/manager upload; the mess listens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', false, 2097152, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do nothing;

create policy voice_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'voice' and (
    public.is_cook(((storage.foldername(name))[1])::uuid) or public.is_manager(((storage.foldername(name))[1])::uuid)));
create policy voice_read on storage.objects for select to authenticated
  using (bucket_id = 'voice' and (
    public.is_member(((storage.foldername(name))[1])::uuid) or public.is_cook(((storage.foldername(name))[1])::uuid)));
