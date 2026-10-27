-- ===========================================================================
-- 005_subscriptions_order.sql · Eventos de Lemon desordenados + repaso de RLS
-- ---------------------------------------------------------------------------
-- Guarda el `updated_at` que manda Lemon para poder descartar los webhooks
-- que llegan tarde (reintentos, red) y que un evento viejo no pise el estado
-- nuevo. Idempotente.
-- ===========================================================================

alter table public.subscriptions
  add column if not exists lemon_updated_at timestamptz;

comment on column public.subscriptions.lemon_updated_at is
  'attributes.updated_at del evento de Lemon. Solo se aplica un webhook si es '
  'igual o más nuevo que este valor.';

-- Buscar la fila por el id de la suscripción (lo usa el webhook cuando el
-- checkout no mandó el user_id).
create index if not exists subscriptions_lemon_id_app_idx
  on public.subscriptions (lemon_subscription_id, app);

-- --------------------------------------------------------------------------
-- RLS: cada usuario lee SOLO su propia fila, y nadie la escribe desde el
-- navegador (el webhook usa la service role key, que saltea RLS).
-- Se vuelve a declarar acá para que quede garantizado aunque 001 sea viejo.
-- --------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: leo mi suscripcion" on public.subscriptions;
create policy "subscriptions: leo mi suscripcion"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Por las dudas: si alguna vez se creó una policy de escritura, se va.
drop policy if exists "subscriptions: escribo mi suscripcion" on public.subscriptions;

-- --------------------------------------------------------------------------
-- Reparación de las filas que escribió la versión vieja del webhook: guardaba
-- el estado de la FACTURA ('paid', 'failed', 'refunded'…) en lugar del estado
-- del plan. Si la prueba o la renovación siguen en el futuro, el plan estaba
-- vigente: lo dejamos como corresponde.
-- --------------------------------------------------------------------------
update public.subscriptions
set status = case
      when trial_ends_at is not null and trial_ends_at > now() then 'on_trial'
      else 'active'
    end
where app = 'turnos'
  and status not in ('on_trial', 'active', 'past_due', 'cancelled', 'expired', 'unpaid', 'paused')
  and (
    (trial_ends_at is not null and trial_ends_at > now())
    or (renews_at is not null and renews_at > now())
  );
