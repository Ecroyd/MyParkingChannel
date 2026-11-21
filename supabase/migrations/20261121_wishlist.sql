-- Wishlist and bugs (/admin/wishlist): feature requests, changes and bug reports that anyone
-- signed in to a car park's admin can post. Everyone at that car park sees its requests; platform
-- admins see every car park's and set the status and a reply.
--
-- Read and written only by the server (service role) after a session check
-- (src/lib/wishlist/access.ts), so RLS is on with no policies.

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('feature', 'change', 'bug')),
  area text not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  links text[] not null default '{}',
  -- Paths in the wishlist-files bucket: <tenant>/<item>/<file>.
  files text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  reply text,
  replied_at timestamptz,
  created_by uuid not null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishlist_items_tenant_created_idx
  on public.wishlist_items (tenant_id, created_at desc);

alter table public.wishlist_items enable row level security;

-- "Me too": one row per person backing a request.
create table if not exists public.wishlist_votes (
  item_id uuid not null references public.wishlist_items(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.wishlist_votes enable row level security;

-- Screenshots and files, private; the app hands out short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('wishlist-files', 'wishlist-files', false, 10485760)
on conflict (id) do nothing;
