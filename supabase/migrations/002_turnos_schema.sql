-- ===========================================================================
-- 002_turnos_schema.sql · Tablas propias de la app Turnos (prefijo turnos_)
-- Idempotente.
-- ===========================================================================

create extension if not exists btree_gist;

-- --------------------------------------------------------------------------
-- Negocios
-- --------------------------------------------------------------------------
create table if not exists public.turnos_businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  slug                text not null,
  name                text not null,
  category            text not null default 'barberia',
  logo_url            text,
  address             text,
  whatsapp            text,
  timezone            text not null default 'America/Argentina/Buenos_Aires',
  color               text not null default '#0b5ed7',
  welcome_message     text,
  -- Reglas de reserva
  min_notice_hours    int  not null default 2,
  max_days_ahead      int  not null default 30,
  slot_step_min       int  not null default 15,
  cancel_window_hours int  not null default 4,
  -- Plantillas de WhatsApp: { reminder, confirm, today, winback }
  wa_templates        jsonb not null default '{}'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists turnos_businesses_slug_key
  on public.turnos_businesses (lower(slug));
create index if not exists turnos_businesses_owner_idx
  on public.turnos_businesses (owner_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'turnos_businesses_slug_format') then
    alter table public.turnos_businesses
      add constraint turnos_businesses_slug_format
      check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$');
  end if;
end;
$$;

drop trigger if exists turnos_businesses_touch on public.turnos_businesses;
create trigger turnos_businesses_touch
  before update on public.turnos_businesses
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Personas que atienden
-- --------------------------------------------------------------------------
create table if not exists public.turnos_staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.turnos_businesses (id) on delete cascade,
  name         text not null,
  photo_url    text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists turnos_staff_business_idx
  on public.turnos_staff (business_id, sort_order);

-- --------------------------------------------------------------------------
-- Servicios
-- --------------------------------------------------------------------------
create table if not exists public.turnos_services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.turnos_businesses (id) on delete cascade,
  name         text not null,
  duration_min int not null default 30 check (duration_min > 0 and duration_min <= 600),
  price        numeric(12, 2),
  description  text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists turnos_services_business_idx
  on public.turnos_services (business_id, sort_order);

-- Quién hace qué. Sin filas para un servicio = lo hacen todas las personas.
create table if not exists public.turnos_staff_services (
  staff_id   uuid not null references public.turnos_staff (id) on delete cascade,
  service_id uuid not null references public.turnos_services (id) on delete cascade,
  primary key (staff_id, service_id)
);
create index if not exists turnos_staff_services_service_idx
  on public.turnos_staff_services (service_id);

-- --------------------------------------------------------------------------
-- Horario semanal (varios bloques por día: 9-13 y 15-20, por ejemplo)
-- weekday: 0 = domingo … 6 = sábado (igual que getDay() de JS)
-- --------------------------------------------------------------------------
create table if not exists public.turnos_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.turnos_businesses (id) on delete cascade,
  staff_id    uuid not null references public.turnos_staff (id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists turnos_hours_staff_idx
  on public.turnos_hours (staff_id, weekday);
create index if not exists turnos_hours_business_idx
  on public.turnos_hours (business_id);

-- --------------------------------------------------------------------------
-- Bloqueos: vacaciones, feriados, "me voy al médico".
-- staff_id null = aplica a todo el negocio.
-- --------------------------------------------------------------------------
create table if not exists public.turnos_time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.turnos_businesses (id) on delete cascade,
  staff_id    uuid references public.turnos_staff (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists turnos_time_off_business_idx
  on public.turnos_time_off (business_id, starts_at);

-- --------------------------------------------------------------------------
-- Clientes (del negocio, no usuarios de la app)
-- --------------------------------------------------------------------------
create table if not exists public.turnos_clients (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.turnos_businesses (id) on delete cascade,
  name        text not null,
  phone       text not null,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists turnos_clients_business_phone_key
  on public.turnos_clients (business_id, phone);
create index if not exists turnos_clients_business_name_idx
  on public.turnos_clients (business_id, lower(name));

-- --------------------------------------------------------------------------
-- Turnos
-- --------------------------------------------------------------------------
create table if not exists public.turnos_appointments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.turnos_businesses (id) on delete cascade,
  staff_id     uuid not null references public.turnos_staff (id) on delete cascade,
  service_id   uuid references public.turnos_services (id) on delete set null,
  client_id    uuid references public.turnos_clients (id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'confirmed'
                 check (status in ('confirmed', 'pending', 'cancelled', 'completed', 'no_show')),
  source       text not null default 'manual'
                 check (source in ('online', 'manual')),
  notes        text,
  -- Precio congelado al momento de reservar (los del servicio cambian).
  price        numeric(12, 2),
  manage_token text not null default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32),
  reminded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists turnos_appointments_token_key
  on public.turnos_appointments (manage_token);
create index if not exists turnos_appointments_business_start_idx
  on public.turnos_appointments (business_id, starts_at);
create index if not exists turnos_appointments_staff_start_idx
  on public.turnos_appointments (staff_id, starts_at);
create index if not exists turnos_appointments_client_idx
  on public.turnos_appointments (client_id, starts_at desc);

-- Nada de turnos pisados para la misma persona (los cancelados no cuentan).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'turnos_appointments_no_overlap'
  ) then
    alter table public.turnos_appointments
      add constraint turnos_appointments_no_overlap
      exclude using gist (
        staff_id with =,
        tstzrange(starts_at, ends_at) with &&
      ) where (status <> 'cancelled');
  end if;
end;
$$;

drop trigger if exists turnos_appointments_touch on public.turnos_appointments;
create trigger turnos_appointments_touch
  before update on public.turnos_appointments
  for each row execute function public.touch_updated_at();
