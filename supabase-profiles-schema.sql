-- ==============================================================================
-- FedEx Shipping Portal - User Profiles & Approval Authorization Schema
-- Run this SQL in your Supabase Project: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create the public.profiles table (without strict username unique constraint to prevent collisions)
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

-- Drop the unique constraint if the table was previously created with it
alter table if exists public.profiles drop constraint if exists profiles_username_key;

-- 2. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. RLS Policies
-- Allow authenticated users to view their own profile
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Allow authenticated users to update their own profile (except cannot approve themselves)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow authenticated users to insert their own profile if missing
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- 4. Function to automatically handle new users added to Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
declare
  clean_username text;
begin
  -- Generate a base username from the email or user ID
  clean_username := lower(split_part(new.email, '@', 1));
  
  -- Fallback if email username is too short or empty
  if clean_username is null or length(clean_username) < 2 then
    clean_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  -- Insert profile immediately with email saved and the rest as null
  -- is_approved defaults to false (admin must approve user before shipments can be created)
  insert into public.profiles (
    id,
    email,
    username,
    name,
    phone,
    company,
    address,
    is_approved,
    role,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    clean_username,
    null,   -- name remains null until user edits in profile
    null,   -- phone remains null until user edits in profile
    null,   -- company remains null until user edits in profile
    null,   -- address remains null until user edits in profile
    false,  -- must be approved by admin to make shipments
    'operator',
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

-- 5. Trigger on auth.users after insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Helper trigger to auto-update the updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- 7. Backfill existing users (if any users are already in auth.users, create their profile)
insert into public.profiles (id, email, username, is_approved, created_at, updated_at)
select 
  id, 
  email, 
  lower(split_part(email, '@', 1)), 
  true, -- existing existing users set to approved so current session works
  now(), 
  now()
from auth.users
on conflict (id) do nothing;

-- 8. Enable Realtime for profiles table (optional but recommended for live approval updates)
alter publication supabase_realtime add table public.profiles;
