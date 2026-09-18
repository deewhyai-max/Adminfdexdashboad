-- ==============================================================================
-- FedEx Dispatch Portal - Super Admin Authorization & Full Access Schema
-- Target Super Admin: multipayinternationalstandard@gmail.com
-- (Safe version: handles publication memberships without errors)
-- ==============================================================================

-- 1. Ensure public.profiles table exists and has proper columns
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  username text default null,
  name text default null,
  phone text default null,
  company text default null,
  address text default null,
  is_approved boolean not null default false,
  role text default 'operator',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- Drop duplicate key constraint on username if present
alter table if exists public.profiles drop constraint if exists profiles_username_key;

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 2. Clean up existing policies on public.profiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Allow select profiles" on public.profiles;
drop policy if exists "Allow update profiles" on public.profiles;
drop policy if exists "Allow insert profiles" on public.profiles;
drop policy if exists "Allow delete profiles" on public.profiles;

-- 3. PROFILES POLICIES:
-- Allow users to view their own profile, or allow Super Admin to view ALL profiles
create policy "Allow select profiles"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id 
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
  );

-- Allow users to update their own profile, or allow Super Admin to update ANY profile (approve/hold/role change)
create policy "Allow update profiles"
  on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id 
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
  )
  with check (
    auth.uid() = id 
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
  );

-- Allow users or admin to insert profiles
create policy "Allow insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = id 
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
  );

-- Allow Super Admin to delete unapproved or spam profiles
create policy "Allow delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
  );


-- 4. SHIPMENTS POLICIES (Full oversight & editing for Admin):
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shipments') then
    alter table public.shipments enable row level security;

    -- Drop existing shipment policies
    drop policy if exists "Users can view own shipments" on public.shipments;
    drop policy if exists "Users can insert own shipments" on public.shipments;
    drop policy if exists "Users can update own shipments" on public.shipments;
    drop policy if exists "Users can delete own shipments" on public.shipments;
    drop policy if exists "Admin and users can view shipments" on public.shipments;
    drop policy if exists "Admin and users can update shipments" on public.shipments;
    drop policy if exists "Admin and users can insert shipments" on public.shipments;
    drop policy if exists "Admin and users can delete shipments" on public.shipments;

    -- Super Admin can view all shipments; regular operators view their own
    create policy "Admin and users can view shipments"
      on public.shipments
      for select
      to authenticated
      using (
        auth.uid() = user_id 
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
      );

    -- Super Admin can update any shipment; regular operators update their own
    create policy "Admin and users can update shipments"
      on public.shipments
      for update
      to authenticated
      using (
        auth.uid() = user_id 
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
      )
      with check (
        auth.uid() = user_id 
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
      );

    -- Super Admin and regular operators can create shipments
    create policy "Admin and users can insert shipments"
      on public.shipments
      for insert
      to authenticated
      with check (
        auth.uid() = user_id 
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
      );

    -- Super Admin can delete shipments; regular operators delete their own
    create policy "Admin and users can delete shipments"
      on public.shipments
      for delete
      to authenticated
      using (
        auth.uid() = user_id 
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'multipayinternationalstandard@gmail.com'
      );
  end if;
end $$;


-- 5. Promote multipayinternationalstandard@gmail.com to Super Admin immediately
update public.profiles
set 
  is_approved = true,
  role = 'admin',
  updated_at = now()
where lower(email) = 'multipayinternationalstandard@gmail.com';

-- Backfill any existing users that might be missing profiles
insert into public.profiles (id, email, username, is_approved, role, created_at, updated_at)
select 
  id, 
  email, 
  lower(split_part(email, '@', 1)), 
  case 
    when lower(email) = 'multipayinternationalstandard@gmail.com' then true 
    else false 
  end,
  case 
    when lower(email) = 'multipayinternationalstandard@gmail.com' then 'admin' 
    else 'operator' 
  end,
  now(), 
  now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  is_approved = case 
    when lower(excluded.email) = 'multipayinternationalstandard@gmail.com' then true 
    else public.profiles.is_approved 
  end,
  role = case 
    when lower(excluded.email) = 'multipayinternationalstandard@gmail.com' then 'admin' 
    else public.profiles.role 
  end,
  updated_at = now();

-- 6. Safely ensure Realtime publication without erroring if already added
do $$
begin
  -- Check and add profiles table only if not already in publication
  if not exists (
    select 1 
    from pg_publication_tables 
    where pubname = 'supabase_realtime' 
      and schemaname = 'public' 
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  -- Check and add shipments table only if not already in publication
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shipments') then
    if not exists (
      select 1 
      from pg_publication_tables 
      where pubname = 'supabase_realtime' 
        and schemaname = 'public' 
        and tablename = 'shipments'
    ) then
      alter publication supabase_realtime add table public.shipments;
    end if;
  end if;
end $$;
