create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null check (role in ('client', 'freelancer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.freelancer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline text not null default '' check (char_length(headline) <= 100),
  bio text not null default '' check (char_length(bio) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  title text not null check (char_length(title) between 5 and 140),
  description text not null check (char_length(description) between 10 and 1500),
  price_cents integer not null check (price_cents between 1 and 100000000),
  tags text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(tags) <= 8)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  client_display_name text not null,
  freelancer_display_name text not null,
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, freelancer_id),
  check (client_id <> freelancer_id),
  check (char_length(category) <= 80)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists listings_published_created_idx
  on public.listings (published, created_at desc);
create index if not exists listings_freelancer_created_idx
  on public.listings (freelancer_id, created_at desc);
create index if not exists conversations_client_updated_idx
  on public.conversations (client_id, updated_at desc);
create index if not exists conversations_freelancer_updated_idx
  on public.conversations (freelancer_id, updated_at desc);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create or replace function public.handle_new_wefans_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_display_name text;
  new_role text;
begin
  new_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if new_display_name is null then
    new_display_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Wefans member');
  end if;
  new_role := case when new.raw_user_meta_data ->> 'role' = 'freelancer' then 'freelancer' else 'client' end;

  insert into public.profiles (id, display_name, role)
  values (new.id, new_display_name, new_role);

  if new_role = 'freelancer' then
    insert into public.freelancer_profiles (user_id, display_name)
    values (new.id, new_display_name);
  end if;
  return new;
end;
$$;

drop trigger if exists on_wefans_auth_user_created on auth.users;
create trigger on_wefans_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_wefans_user();

create or replace function public.keep_wefans_role_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Account role cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_is_immutable on public.profiles;
create trigger profiles_role_is_immutable
  before update on public.profiles
  for each row execute function public.keep_wefans_role_immutable();

create or replace function public.sync_wefans_freelancer_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name and new.role = 'freelancer' then
    update public.freelancer_profiles
    set display_name = new.display_name, updated_at = now()
    where user_id = new.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_sync_freelancer_name on public.profiles;
create trigger profiles_sync_freelancer_name
  before update on public.profiles
  for each row execute function public.sync_wefans_freelancer_name();

create or replace function public.prepare_wefans_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.display_name into new.client_display_name
  from public.profiles p where p.id = new.client_id and p.role = 'client';
  if new.client_display_name is null then
    raise exception 'A valid client account is required to start a conversation.';
  end if;

  select fp.display_name into new.freelancer_display_name
  from public.freelancer_profiles fp where fp.user_id = new.freelancer_id;
  if new.freelancer_display_name is null then
    raise exception 'A valid freelancer profile is required to start a conversation.';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_set_participant_names on public.conversations;
create trigger conversations_set_participant_names
  before insert on public.conversations
  for each row execute function public.prepare_wefans_conversation();

create or replace function public.touch_wefans_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_update_conversation_time on public.messages;
create trigger messages_update_conversation_time
  after insert on public.messages
  for each row execute function public.touch_wefans_conversation();

alter table public.profiles enable row level security;
alter table public.freelancer_profiles enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Freelancer profiles are public" on public.freelancer_profiles;
create policy "Freelancer profiles are public"
  on public.freelancer_profiles for select to anon, authenticated
  using (true);

drop policy if exists "Freelancers can update their own public profile" on public.freelancer_profiles;
create policy "Freelancers can update their own public profile"
  on public.freelancer_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Published listings and owner drafts are readable" on public.listings;
create policy "Published listings and owner drafts are readable"
  on public.listings for select to anon, authenticated
  using (published or freelancer_id = (select auth.uid()));

drop policy if exists "Freelancers can create their own listings" on public.listings;
create policy "Freelancers can create their own listings"
  on public.listings for insert to authenticated
  with check (
    freelancer_id = (select auth.uid())
    and exists (
      select 1 from public.freelancer_profiles fp
      where fp.user_id = (select auth.uid())
    )
  );

drop policy if exists "Freelancers can update their own listings" on public.listings;
create policy "Freelancers can update their own listings"
  on public.listings for update to authenticated
  using (freelancer_id = (select auth.uid()))
  with check (freelancer_id = (select auth.uid()));

drop policy if exists "Freelancers can delete their own listings" on public.listings;
create policy "Freelancers can delete their own listings"
  on public.listings for delete to authenticated
  using (freelancer_id = (select auth.uid()));

drop policy if exists "Conversation members can read their conversations" on public.conversations;
create policy "Conversation members can read their conversations"
  on public.conversations for select to authenticated
  using (
    client_id = (select auth.uid())
    or freelancer_id = (select auth.uid())
  );

drop policy if exists "Clients can start conversations with freelancers" on public.conversations;
create policy "Clients can start conversations with freelancers"
  on public.conversations for insert to authenticated
  with check (
    client_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'client'
    )
    and exists (
      select 1 from public.freelancer_profiles fp
      where fp.user_id = freelancer_id
    )
  );

drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Conversation members can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and ((select auth.uid()) = c.client_id or (select auth.uid()) = c.freelancer_id)
    )
  );

drop policy if exists "Conversation members can send messages as themselves" on public.messages;
create policy "Conversation members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and ((select auth.uid()) = c.client_id or (select auth.uid()) = c.freelancer_id)
    )
  );

revoke all on public.profiles, public.freelancer_profiles, public.listings, public.conversations, public.messages
  from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.freelancer_profiles to anon, authenticated;
grant update (headline, bio) on public.freelancer_profiles to authenticated;
grant select on public.listings to anon, authenticated;
grant insert (freelancer_id, category, title, description, price_cents, tags, published)
  on public.listings to authenticated;
grant update (category, title, description, price_cents, tags, published)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant select on public.conversations to authenticated;
grant insert (client_id, freelancer_id, category) on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
