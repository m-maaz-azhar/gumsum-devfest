-- Gumsum: initial schema (ARCHITECTURE.md §4)
-- Tables, enums, indexes, RLS, storage bucket, Realtime publication, search RPC.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums (Status Model sheet)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.item_status as enum ('available','claim_pending','ready_for_pickup','returned','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum ('submitted','under_review','approved','not_selected','rejected','collected','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_role as enum ('bot','user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.score_state as enum ('pending','done','failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Immutable text used for keyword (trigram) search: title + category + colours + tags.
create or replace function public.item_search_doc(title text, category text, colours text[], tags text[])
returns text language sql immutable parallel safe as $$
  select lower(
    coalesce(title,'') || ' ' || coalesce(category,'') || ' ' ||
    coalesce(array_to_string(colours,' '),'') || ' ' || coalesce(array_to_string(tags,' '),'')
  )
$$;

-- Great-circle distance in km.
create or replace function public.distance_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable parallel safe as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )) end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  name text not null,
  address text not null default '',
  lat float8,
  lng float8,
  desk_hours text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists locations_org_idx on public.locations(org_id);
create index if not exists locations_name_trgm on public.locations using gin (name extensions.gin_trgm_ops);
create index if not exists locations_address_trgm on public.locations using gin (address extensions.gin_trgm_ops);

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists staff_members_org_idx on public.staff_members(org_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 2 and 50),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_verified boolean not null default false,
  notify_push boolean not null default false,
  use_location boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  title text not null check (char_length(title) between 3 and 60),
  category text,
  colours text[] not null default '{}',
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  exact_spot text check (exact_spot is null or char_length(exact_spot) <= 80),
  found_at timestamptz not null default now(),
  status public.item_status not null default 'available',
  archive_reason text,
  archived_at timestamptz,
  embedding extensions.vector(1536),
  search_doc text generated always as (public.item_search_doc(title, category, colours, tags)) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_org_status_idx on public.items(org_id, status, created_at desc);
create index if not exists items_location_idx on public.items(location_id);
create index if not exists items_search_trgm on public.items using gin (search_doc extensions.gin_trgm_ops);
create index if not exists items_embedding_hnsw on public.items using hnsw (embedding extensions.vector_cosine_ops);
drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at before update on public.items for each row execute function public.set_updated_at();

create table if not exists public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  path text not null,
  position int not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists item_images_item_idx on public.item_images(item_id, position);

-- The verification secret. RLS ON, NO policies: only the service role can read it.
create table if not exists public.item_secrets (
  item_id uuid primary key references public.items(id) on delete cascade,
  private_description text not null check (char_length(private_description) between 20 and 1000),
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  claimant_id uuid not null references auth.users(id) on delete cascade,
  status public.claim_status not null default 'submitted',
  chat_done boolean not null default false,
  followups_asked int not null default 0 check (followups_asked between 0 and 2),
  score int check (score is null or score between 0 and 100),
  score_label text check (score_label is null or score_label in ('High','Medium','Low')),
  score_state public.score_state not null default 'pending',
  scoring_attempts int not null default 0,
  rationale jsonb,
  model_version text,
  proof_image_path text,
  reject_reason text,
  reject_note text,
  submitted_at timestamptz,
  scored_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, claimant_id)
);
create index if not exists claims_item_idx on public.claims(item_id, score desc nulls last, created_at);
create index if not exists claims_claimant_idx on public.claims(claimant_id, created_at desc);
-- Only one approved claim per item at a time (STF-CLM-02 #5).
create unique index if not exists claims_one_approved_per_item on public.claims(item_id) where status = 'approved';
drop trigger if exists claims_updated_at on public.claims;
create trigger claims_updated_at before update on public.claims for each row execute function public.set_updated_at();

create table if not exists public.claim_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists claim_messages_claim_idx on public.claim_messages(claim_id, created_at);

create table if not exists public.pickups (
  claim_id uuid primary key references public.claims(id) on delete cascade,
  code_hash text not null,
  qr_token text not null,
  expires_at timestamptz not null,
  collected_at timestamptz,
  handed_over_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_org_idx on public.audit_events(org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (§4.1). All writes go through Flask (service role).
-- These read policies exist for Realtime and to make accidental queries safe.
-- ---------------------------------------------------------------------------
alter table public.organizations      enable row level security;
alter table public.locations          enable row level security;
alter table public.staff_members      enable row level security;
alter table public.profiles           enable row level security;
alter table public.items              enable row level security;
alter table public.item_images        enable row level security;
alter table public.item_secrets       enable row level security;
alter table public.claims             enable row level security;
alter table public.claim_messages     enable row level security;
alter table public.pickups            enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_events       enable row level security;

-- SECURITY DEFINER so policies can look up staff membership without recursion.
create or replace function public.current_staff_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.staff_members where user_id = auth.uid()
$$;
revoke all on function public.current_staff_org() from public, anon;
grant execute on function public.current_staff_org() to authenticated;

drop policy if exists "staff read own membership" on public.staff_members;
create policy "staff read own membership" on public.staff_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "staff read own org" on public.organizations;
create policy "staff read own org" on public.organizations
  for select to authenticated using (id = public.current_staff_org());

drop policy if exists "staff read own org locations" on public.locations;
create policy "staff read own org locations" on public.locations
  for select to authenticated using (org_id = public.current_staff_org());

drop policy if exists "claimant reads own profile" on public.profiles;
create policy "claimant reads own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "staff read own org items" on public.items;
create policy "staff read own org items" on public.items
  for select to authenticated using (org_id = public.current_staff_org());

drop policy if exists "claimant reads own claims" on public.claims;
create policy "claimant reads own claims" on public.claims
  for select to authenticated using (claimant_id = auth.uid());

drop policy if exists "staff read own org claims" on public.claims;
create policy "staff read own org claims" on public.claims
  for select to authenticated using (
    exists (select 1 from public.items i where i.id = claims.item_id and i.org_id = public.current_staff_org())
  );

drop policy if exists "claimant reads own claim messages" on public.claim_messages;
create policy "claimant reads own claim messages" on public.claim_messages
  for select to authenticated using (
    exists (select 1 from public.claims c where c.id = claim_messages.claim_id and c.claimant_id = auth.uid())
  );

drop policy if exists "staff read own org claim messages" on public.claim_messages;
create policy "staff read own org claim messages" on public.claim_messages
  for select to authenticated using (
    exists (select 1 from public.claims c join public.items i on i.id = c.item_id
            where c.id = claim_messages.claim_id and i.org_id = public.current_staff_org())
  );

-- item_secrets, item_images, pickups, push_subscriptions, audit_events: no policies on purpose.

-- Belt and braces: the client roles get no table privileges on the secret at all.
revoke all on public.item_secrets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: claim status and score changes.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.claims;
exception when duplicate_object then null; when undefined_object then null; end $$;
alter table public.claims replica identity full;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for item and proof photos (uploads via signed URLs).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Search (§6.3). Called by Flask through RPC with the service role.
-- ---------------------------------------------------------------------------
create or replace function public.match_locations(where_text text, min_similarity float8 default 0.3)
returns table (id uuid, org_id uuid, name text, address text, similarity float8)
language sql stable set search_path = public, extensions as $$
  select l.id, l.org_id, l.name, l.address,
         greatest(similarity(l.name, where_text), similarity(l.address, where_text),
                  word_similarity(where_text, l.name))::float8 as similarity
  from public.locations l
  where where_text is not null and length(trim(where_text)) > 0
    and greatest(similarity(l.name, where_text), similarity(l.address, where_text),
                 word_similarity(where_text, l.name)) >= min_similarity
  order by similarity desc
$$;

create or replace function public.search_items(
  query_embedding extensions.vector(1536) default null,
  what_text text default null,
  where_text text default null,
  lat float8 default null,
  lng float8 default null,
  p_location_id uuid default null,
  page int default 0,
  page_size int default 20
)
returns table (
  id uuid, title text, category text, colours text[], tags text[], exact_spot text,
  found_at timestamptz, status public.item_status, location_id uuid, location_name text,
  distance_km float8, vector_score float8, keyword_score float8, rank float8, where_matched boolean
)
language plpgsql stable set search_path = public, extensions as $$
#variable_conflict use_column
declare
  loc_ids uuid[];
  matched boolean := null;
begin
  if p_location_id is not null then
    loc_ids := array[p_location_id];
  elsif where_text is not null and length(trim(where_text)) > 0 then
    select array_agg(m.id) into loc_ids from public.match_locations(where_text) m;
    matched := loc_ids is not null;
  end if;

  return query
  with scored as (
    select i.*, l.name as loc_name,
      public.distance_km(search_items.lat, search_items.lng, l.lat, l.lng) as dist,
      case when search_items.query_embedding is not null and i.embedding is not null
           then 1 - (i.embedding <=> search_items.query_embedding) else 0 end::float8 as vs,
      case when what_text is not null and length(trim(what_text)) > 0
           then greatest(similarity(i.search_doc, lower(what_text)), word_similarity(lower(what_text), i.search_doc))
           else 0 end::float8 as ks
    from public.items i join public.locations l on l.id = i.location_id
    where i.status in ('available','claim_pending')
      and (loc_ids is null or i.location_id = any(loc_ids))
  )
  select s.id, s.title, s.category, s.colours, s.tags, s.exact_spot, s.found_at, s.status,
         s.location_id, s.loc_name, s.dist, s.vs, s.ks,
         (case when search_items.query_embedding is null then s.ks else 0.7 * s.vs + 0.3 * s.ks end)::float8 as rank,
         matched
  from scored s
  where what_text is null or length(trim(what_text)) = 0 or s.ks >= 0.3 or s.vs >= 0.3
  order by
    case when search_items.lat is not null and search_items.lng is not null and (where_text is null or length(trim(where_text)) = 0)
         then s.dist end asc nulls last,
    rank desc, s.found_at desc
  limit page_size offset page * page_size;
end $$;

revoke all on function public.search_items(extensions.vector, text, text, float8, float8, uuid, int, int) from public, anon, authenticated;
revoke all on function public.match_locations(text, float8) from public, anon, authenticated;
grant execute on function public.search_items(extensions.vector, text, text, float8, float8, uuid, int, int) to service_role;
grant execute on function public.match_locations(text, float8) to service_role;
