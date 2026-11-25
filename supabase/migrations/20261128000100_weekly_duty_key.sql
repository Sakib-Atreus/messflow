-- weekly_duty had a composite primary key (mess_id, weekday, member_id). PostgREST treats a table
-- whose primary key holds foreign keys to two tables as a many-to-many "join table", which made the
-- embed mess_members → messes ambiguous (direct FK vs. through weekly_duty) and broke that query.
-- A surrogate key keeps the same uniqueness without looking like a join table.

alter table public.weekly_duty drop constraint weekly_duty_pkey;
alter table public.weekly_duty add column id uuid not null default gen_random_uuid() primary key;
alter table public.weekly_duty add constraint weekly_duty_unique unique (mess_id, weekday, member_id);

-- PostgREST caches the schema; tell it to reload now
notify pgrst, 'reload schema';
