-- ===========================================================================
-- 001_common.sql · Tablas COMUNES a todas las apps de suscripción Futurislabs
-- ---------------------------------------------------------------------------
-- Proyecto Supabase compartido "futurislabs". Estas tablas NO llevan prefijo
-- porque las reusan todas las apps; `subscriptions.app` separa cada producto.
-- Idempotente: se puede volver a correr sin romper nada.
-- ===========================================================================

create extension if not exists btree_gist;

-- --------------------------------------------------------------------------
-- profiles: espejo mínimo de auth.users para poder joinear desde la app.
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: leo mi perfil" on public.profiles;
create policy "profiles: leo mi perfil"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: edito mi perfil" on public.profiles;
create policy "profiles: edito mi perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Se crea el perfil solo, al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill por si ya había usuarios antes de esta migración.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- updated_at automático (lo usan varias tablas).
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- subscriptions: una fila por (usuario, app). Solo la escribe el webhook de
-- Lemon Squeezy con la service role key; el usuario únicamente la lee.
-- --------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  app                   text not null,
  lemon_subscription_id text,
  lemon_customer_id     text,
  variant_id            text,
  status                text not null default 'none',
  trial_ends_at         timestamptz,
  renews_at             timestamptz,
  ends_at               timestamptz,
  update_payment_url    text,
  customer_portal_url   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists subscriptions_user_app_key
  on public.subscriptions (user_id, app);
create index if not exists subscriptions_lemon_id_idx
  on public.subscriptions (lemon_subscription_id);

alter table public.subscriptions enable row level security;

-- Solo lectura de lo propio. No hay policies de insert/update/delete a
-- propósito: únicamente el webhook (service role, que saltea RLS) escribe.
drop policy if exists "subscriptions: leo mi suscripcion" on public.subscriptions;
create policy "subscriptions: leo mi suscripcion"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();
