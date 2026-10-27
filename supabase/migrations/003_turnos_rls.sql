-- ===========================================================================
-- 003_turnos_rls.sql · RLS de las tablas turnos_*
-- ---------------------------------------------------------------------------
-- Regla: el dueño ve y edita SOLO lo de sus negocios. No hay lectura pública
-- directa: la página de reservas /r/:slug pasa por Pages Functions que usan
-- la service role key (saltea RLS) y expone únicamente lo necesario.
-- Idempotente.
-- ===========================================================================

-- Helper: ¿este negocio es mío? SECURITY DEFINER para no disparar RLS en
-- cascada cuando se lo usa dentro de otras policies.
create or replace function public.turnos_owns_business(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.turnos_businesses
    where id = b and owner_id = auth.uid()
  );
$$;

revoke all on function public.turnos_owns_business(uuid) from public;
grant execute on function public.turnos_owns_business(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Negocios
-- --------------------------------------------------------------------------
alter table public.turnos_businesses enable row level security;

drop policy if exists "turnos_businesses: leo los mios" on public.turnos_businesses;
create policy "turnos_businesses: leo los mios"
  on public.turnos_businesses for select
  using (owner_id = auth.uid());

drop policy if exists "turnos_businesses: creo los mios" on public.turnos_businesses;
create policy "turnos_businesses: creo los mios"
  on public.turnos_businesses for insert
  with check (owner_id = auth.uid());

drop policy if exists "turnos_businesses: edito los mios" on public.turnos_businesses;
create policy "turnos_businesses: edito los mios"
  on public.turnos_businesses for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "turnos_businesses: borro los mios" on public.turnos_businesses;
create policy "turnos_businesses: borro los mios"
  on public.turnos_businesses for delete
  using (owner_id = auth.uid());

-- --------------------------------------------------------------------------
-- Tablas hijas con business_id: una sola policy ALL por tabla.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'turnos_staff',
    'turnos_services',
    'turnos_hours',
    'turnos_time_off',
    'turnos_clients',
    'turnos_appointments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: solo lo mio" on public.%I', t, t);
    execute format(
      'create policy "%s: solo lo mio" on public.%I for all
         using (public.turnos_owns_business(business_id))
         with check (public.turnos_owns_business(business_id))', t, t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- turnos_staff_services: no tiene business_id, se valida por la persona.
-- --------------------------------------------------------------------------
alter table public.turnos_staff_services enable row level security;

drop policy if exists "turnos_staff_services: solo lo mio" on public.turnos_staff_services;
create policy "turnos_staff_services: solo lo mio"
  on public.turnos_staff_services for all
  using (
    exists (
      select 1 from public.turnos_staff s
      where s.id = staff_id and public.turnos_owns_business(s.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.turnos_staff s
      where s.id = staff_id and public.turnos_owns_business(s.business_id)
    )
  );

-- --------------------------------------------------------------------------
-- Realtime: el aviso de "entró una reserva online" escucha los turnos.
-- (La RLS se sigue aplicando: cada dueño recibe solo lo suyo.)
-- --------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.turnos_appointments;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

alter table public.turnos_appointments replica identity full;
