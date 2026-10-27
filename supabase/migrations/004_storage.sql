-- ===========================================================================
-- 004_storage.sql · Bucket público para logos y fotos de las personas
-- ---------------------------------------------------------------------------
-- Rutas: {business_id}/logo-xxxx.jpg  |  {business_id}/staff/xxxx.jpg
-- Lectura pública (la usa /r/:slug), escritura solo del dueño en SU carpeta.
-- Idempotente.
-- ===========================================================================

-- Variante que acepta texto: el primer segmento de la ruta puede no ser un
-- uuid válido (archivo subido a mano), y un cast que explota rompe la policy.
create or replace function public.turnos_owns_business_txt(b text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare bid uuid;
begin
  begin
    bid := b::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.turnos_businesses t
    where t.id = bid and t.owner_id = auth.uid()
  );
end;
$$;

revoke all on function public.turnos_owns_business_txt(text) from public;
grant execute on function public.turnos_owns_business_txt(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'turnos-public',
  'turnos-public',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cualquiera puede ver las imágenes (es un bucket público).
drop policy if exists "turnos-public: lectura publica" on storage.objects;
create policy "turnos-public: lectura publica"
  on storage.objects for select
  using (bucket_id = 'turnos-public');

-- El dueño sube/reemplaza/borra solo dentro de la carpeta de sus negocios.
drop policy if exists "turnos-public: subo en mi carpeta" on storage.objects;
create policy "turnos-public: subo en mi carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'turnos-public'
    and public.turnos_owns_business_txt((storage.foldername(name))[1])
  );

drop policy if exists "turnos-public: edito en mi carpeta" on storage.objects;
create policy "turnos-public: edito en mi carpeta"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'turnos-public'
    and public.turnos_owns_business_txt((storage.foldername(name))[1])
  );

drop policy if exists "turnos-public: borro en mi carpeta" on storage.objects;
create policy "turnos-public: borro en mi carpeta"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'turnos-public'
    and public.turnos_owns_business_txt((storage.foldername(name))[1])
  );
