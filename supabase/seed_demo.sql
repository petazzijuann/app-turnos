-- ===========================================================================
-- seed_demo.sql · OPCIONAL · "Barbería Demo" (/r/demo)
-- ---------------------------------------------------------------------------
-- Sirve para capturas de pantalla y para mostrar la página de reservas en la
-- landing. Corré esto DESPUÉS de 001-004 y después de haberte registrado en
-- la app al menos una vez (necesita un usuario dueño).
--
-- Cambiá el email de abajo por el tuyo. Volver a correrlo borra y recrea el
-- negocio demo (no toca el resto de tus datos).
-- ===========================================================================

do $$
declare
  v_email     text := 'juancruztrabajos@outlook.com'; -- <<< TU EMAIL
  v_owner     uuid;
  v_biz       uuid;
  v_tz        text := 'America/Argentina/Buenos_Aires';
  v_nico      uuid;
  v_lu        uuid;
  v_corte     uuid;
  v_barba     uuid;
  v_combo     uuid;
  v_color     uuid;
  v_ninos     uuid;
  v_c1        uuid;
  v_c2        uuid;
  v_c3        uuid;
  v_c4        uuid;
  -- Lunes de esta semana, 00:00 hora del negocio.
  v_monday    timestamptz;
  d           int;
begin
  select id into v_owner from auth.users where lower(email) = lower(v_email) limit 1;
  if v_owner is null then
    raise exception 'No encontré el usuario %. Registrate primero en la app o cambiá v_email.', v_email;
  end if;

  v_monday := (date_trunc('week', (now() at time zone v_tz))::date::text || ' 00:00')::timestamp
              at time zone v_tz;

  -- Borrón y cuenta nueva del negocio demo (cascada a todo lo suyo).
  delete from public.turnos_businesses where lower(slug) = 'demo';

  insert into public.turnos_businesses (
    owner_id, slug, name, category, address, whatsapp, timezone, color,
    welcome_message, min_notice_hours, max_days_ahead, slot_step_min,
    cancel_window_hours, wa_templates
  ) values (
    v_owner, 'demo', 'Barbería Demo', 'barberia',
    'Av. Corrientes 1234, CABA', '+5491122334455', v_tz, '#0b5ed7',
    '¡Gracias por reservar! Si no podés venir, avisanos con tiempo así le damos el lugar a otra persona.',
    2, 30, 15, 4,
    jsonb_build_object(
      'reminder', 'Hola {nombre}! Te recordamos tu turno en {negocio}: {servicio} el {dia} a las {hora} con {persona}. Confirmá o cancelá acá: {link}',
      'confirm',  'Hola {nombre}! Te agendamos {servicio} el {dia} a las {hora} con {persona} en {negocio}. Cualquier cambio: {link}',
      'today',    'Hola {nombre}! Hoy te esperamos a las {hora} en {negocio}. ¡Nos vemos!',
      'winback',  'Hola {nombre}! Hace un rato que no te vemos por {negocio}. ¿Te reservamos un turno esta semana?'
    )
  ) returning id into v_biz;

  insert into public.turnos_staff (business_id, name, sort_order)
    values (v_biz, 'Nico', 1) returning id into v_nico;
  insert into public.turnos_staff (business_id, name, sort_order)
    values (v_biz, 'Lu', 2) returning id into v_lu;

  insert into public.turnos_services (business_id, name, duration_min, price, description, sort_order)
    values (v_biz, 'Corte de pelo', 30, 9000, 'Corte con máquina y tijera, lavado incluido.', 1)
    returning id into v_corte;
  insert into public.turnos_services (business_id, name, duration_min, price, description, sort_order)
    values (v_biz, 'Barba', 20, 6000, 'Perfilado y afeitado con toalla caliente.', 2)
    returning id into v_barba;
  insert into public.turnos_services (business_id, name, duration_min, price, description, sort_order)
    values (v_biz, 'Corte + barba', 45, 13000, 'El combo de siempre.', 3)
    returning id into v_combo;
  insert into public.turnos_services (business_id, name, duration_min, price, description, sort_order)
    values (v_biz, 'Color', 60, 18000, 'Color o platinado. Consultanos antes.', 4)
    returning id into v_color;
  insert into public.turnos_services (business_id, name, duration_min, price, description, sort_order)
    values (v_biz, 'Corte para niños', 25, 7000, 'Hasta 12 años.', 5)
    returning id into v_ninos;

  -- Lu no hace color; el resto lo hacen los dos.
  insert into public.turnos_staff_services (staff_id, service_id) values
    (v_nico, v_corte), (v_nico, v_barba), (v_nico, v_combo), (v_nico, v_color), (v_nico, v_ninos),
    (v_lu, v_corte), (v_lu, v_barba), (v_lu, v_combo), (v_lu, v_ninos);

  -- Horarios: lunes a viernes 9-13 y 15-20; sábado 9-14.
  for d in 1..5 loop
    insert into public.turnos_hours (business_id, staff_id, weekday, start_time, end_time) values
      (v_biz, v_nico, d, '09:00', '13:00'),
      (v_biz, v_nico, d, '15:00', '20:00'),
      (v_biz, v_lu,   d, '09:00', '13:00'),
      (v_biz, v_lu,   d, '15:00', '20:00');
  end loop;
  insert into public.turnos_hours (business_id, staff_id, weekday, start_time, end_time) values
    (v_biz, v_nico, 6, '09:00', '14:00'),
    (v_biz, v_lu,   6, '09:00', '14:00');

  insert into public.turnos_clients (business_id, name, phone, email, notes) values
    (v_biz, 'Martín Pérez', '+5491133445566', 'martin@example.com', 'Siempre corte bajo a los costados.')
    returning id into v_c1;
  insert into public.turnos_clients (business_id, name, phone, email) values
    (v_biz, 'Sofía Gómez', '+5491144556677', 'sofia@example.com') returning id into v_c2;
  insert into public.turnos_clients (business_id, name, phone) values
    (v_biz, 'Diego Fernández', '+5491155667788') returning id into v_c3;
  insert into public.turnos_clients (business_id, name, phone, notes) values
    (v_biz, 'Carla Ruiz', '+5491166778899', 'Faltó dos veces sin avisar.') returning id into v_c4;

  -- Turnos de esta semana (martes a sábado), mezcla de estados y orígenes.
  insert into public.turnos_appointments
    (business_id, staff_id, service_id, client_id, starts_at, ends_at, status, source, price, notes)
  values
    (v_biz, v_nico, v_corte, v_c1, v_monday + interval '1 day 10 hours',
      v_monday + interval '1 day 10 hours 30 minutes', 'completed', 'online', 9000, null),
    (v_biz, v_lu, v_combo, v_c2, v_monday + interval '1 day 16 hours',
      v_monday + interval '1 day 16 hours 45 minutes', 'completed', 'manual', 13000, null),
    (v_biz, v_nico, v_barba, v_c3, v_monday + interval '2 days 11 hours',
      v_monday + interval '2 days 11 hours 20 minutes', 'no_show', 'online', 6000, null),
    (v_biz, v_lu, v_corte, v_c4, v_monday + interval '2 days 17 hours',
      v_monday + interval '2 days 17 hours 30 minutes', 'cancelled', 'online', 9000, 'Canceló por WhatsApp.'),
    (v_biz, v_nico, v_combo, v_c2, v_monday + interval '3 days 9 hours 30 minutes',
      v_monday + interval '3 days 10 hours 15 minutes', 'confirmed', 'online', 13000, null),
    (v_biz, v_lu, v_ninos, v_c1, v_monday + interval '3 days 15 hours',
      v_monday + interval '3 days 15 hours 25 minutes', 'confirmed', 'manual', 7000, 'Viene con el hermanito.'),
    (v_biz, v_nico, v_color, v_c4, v_monday + interval '4 days 10 hours',
      v_monday + interval '4 days 11 hours', 'confirmed', 'online', 18000, null),
    (v_biz, v_lu, v_corte, v_c3, v_monday + interval '5 days 10 hours',
      v_monday + interval '5 days 10 hours 30 minutes', 'pending', 'online', 9000, null);

  raise notice 'Demo listo. Página de reservas: /r/demo (negocio %)', v_biz;
end;
$$;
