-- MessFlow: a "blocked" flag on the profile.
-- The app now checks the login locally (signed token) instead of asking Supabase Auth on every page,
-- which is much faster. Blocking still bans the account in Supabase Auth; this flag lets the app see
-- the block straight away on the next page, from the profile it already loads.
-- Users can't change it themselves: profiles only grants update on a few named columns.

alter table public.profiles add column if not exists blocked boolean not null default false;

update public.profiles p set blocked = true
from auth.users u
where u.id = p.id and u.banned_until is not null and u.banned_until > now();
