/**
 * POST /api/lemon/webhook
 * Webhook de Lemon Squeezy. Verifica la firma X-Signature (HMAC-SHA256 del
 * body CRUDO, comparación en tiempo constante) y hace upsert en
 * `subscriptions`. Idempotente y a prueba de eventos desordenados.
 *
 * Reglas:
 *  - Solo los objetos `data.type === 'subscriptions'` cambian el estado. Los
 *    eventos de pago traen una FACTURA, cuyo status ('paid', 'failed') no es
 *    el del plan: escribirlo dejaba al usuario viendo "Reactiva tu plan".
 *  - Un evento más viejo que lo guardado (según el `updated_at` de Lemon)
 *    no pisa nada.
 *  - Una sola fila por (user_id, app): el upsert va por esa clave.
 */
import { db, type Db } from '../../_lib/db'
import { APP, type Env } from '../../_lib/env'
import { json } from '../../_lib/http'
import {
  decide,
  parseWebhook,
  rowFromApi,
  verifySignature,
  type ParsedWebhook,
  type StoredSubscription,
  type SubscriptionUpsert,
} from '../../../src/shared/lemon'

type StoredRow = {
  user_id: string
  status: string | null
  lemon_updated_at: string | null
}

/** La fila que ya tenemos, buscada por usuario o por id de suscripción. */
async function findStored(
  d: Db,
  userId: string | null,
  subscriptionId: string | null
): Promise<StoredRow | null> {
  if (userId) {
    const row = await d.one<StoredRow>(
      'subscriptions',
      `select=user_id,status,lemon_updated_at&user_id=eq.${userId}&app=eq.${APP}`
    )
    if (row) return row
  }
  if (subscriptionId) {
    return d.one<StoredRow>(
      'subscriptions',
      `select=user_id,status,lemon_updated_at&lemon_subscription_id=eq.${encodeURIComponent(
        subscriptionId
      )}&app=eq.${APP}`
    )
  }
  return null
}

/**
 * De quién es esta suscripción. En orden:
 *   1. el user_id que viajó en el checkout (checkout[custom][user_id])
 *   2. la fila que ya existe con ese lemon_subscription_id
 *   3. el perfil con el mail con el que pagó
 */
async function resolveUser(
  d: Db,
  parsed: ParsedWebhook,
  stored: StoredRow | null
): Promise<string | null> {
  if (parsed.userId) return parsed.userId
  if (stored?.user_id) return stored.user_id
  if (parsed.email) {
    const profile = await d.one<{ id: string }>(
      'profiles',
      `select=id&email=eq.${encodeURIComponent(parsed.email)}`
    )
    return profile?.id ?? null
  }
  return null
}

/**
 * Para los eventos de pago: si hay API key de Lemon, se pide la suscripción de
 * verdad y se usa ESA como fuente del estado. Sin API key se ignoran (el
 * estado igual llega por `subscription_updated`, que Lemon manda siempre que
 * cambia).
 */
async function fetchSubscription(
  env: Env,
  subscriptionId: string
): Promise<SubscriptionUpsert | null> {
  if (!env.LEMON_API_KEY) return null
  try {
    const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
      headers: {
        accept: 'application/vnd.api+json',
        authorization: `Bearer ${env.LEMON_API_KEY}`,
      },
    })
    if (!r.ok) {
      console.error('No pudimos refrescar la suscripción', subscriptionId, r.status)
      return null
    }
    return rowFromApi((await r.json()) as never)
  } catch (e) {
    console.error('Error pidiendo la suscripción a Lemon', subscriptionId, e)
    return null
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // El body crudo es lo que se firma: leerlo como texto y no re-serializar.
  const raw = await request.text()
  const signature = request.headers.get('x-signature')

  if (!env.LEMON_WEBHOOK_SECRET) {
    console.error('Falta LEMON_WEBHOOK_SECRET: el webhook queda rechazado a propósito.')
    return json({ error: 'webhook no configurado' }, { status: 500 })
  }
  if (!(await verifySignature(raw, signature, env.LEMON_WEBHOOK_SECRET))) {
    return json({ error: 'firma inválida' }, { status: 401 })
  }

  let parsed: ParsedWebhook | null
  try {
    parsed = parseWebhook(JSON.parse(raw))
  } catch {
    return json({ error: 'body inválido' }, { status: 400 })
  }
  if (!parsed) return json({ ok: true, ignored: 'sin evento' })

  // Lo que no describe la suscripción se descarta ANTES de tocar la base:
  // así un evento de facturación no genera consultas ni puede romper nada.
  if (!parsed.isSubscription) {
    const fresh =
      parsed.isInvoice && parsed.subscriptionId
        ? await fetchSubscription(env, parsed.subscriptionId)
        : null
    if (!fresh)
      return json({
        ok: true,
        ignored: parsed.isInvoice
          ? `${parsed.event}: es una factura, no cambia el estado del plan`
          : `${parsed.event} (${parsed.objectType})`,
      })
    parsed = { ...parsed, isSubscription: true, row: fresh, userId: parsed.userId ?? fresh.user_id }
  }

  const d = db(env)
  const stored = await findStored(d, parsed.userId, parsed.subscriptionId)

  const decision = decide(parsed, stored as StoredSubscription)
  if (!decision.apply) {
    if (decision.reason === 'evento-viejo')
      console.warn('Evento viejo descartado', parsed.event, parsed.row?.lemon_updated_at)
    return json({ ok: true, ignored: decision.reason, event: parsed.event })
  }

  const row = decision.row
  const userId = await resolveUser(d, parsed, stored)

  if (!userId) {
    // Sin usuario no hay dónde guardarla. Se responde 200 para que Lemon no
    // reintente para siempre, pero queda el log para investigarlo.
    console.error('Webhook sin user_id ni perfil para', parsed.email, parsed.event)
    return json({ ok: true, ignored: 'sin usuario' })
  }

  await d.upsert(
    'subscriptions',
    {
      user_id: userId,
      app: APP,
      lemon_subscription_id: row.lemon_subscription_id,
      lemon_customer_id: row.lemon_customer_id,
      variant_id: row.variant_id,
      status: row.status,
      trial_ends_at: row.trial_ends_at,
      renews_at: row.renews_at,
      ends_at: row.ends_at,
      update_payment_url: row.update_payment_url,
      customer_portal_url: row.customer_portal_url,
      lemon_updated_at: row.lemon_updated_at,
      updated_at: new Date().toISOString(),
    },
    'user_id,app',
    'user_id'
  )

  return json({ ok: true, event: parsed.event, status: row.status })
}

/** Un GET al webhook no hace nada: sirve para chequear que la ruta existe. */
export const onRequestGet: PagesFunction<Env> = () =>
  json({ ok: true, hint: 'Este endpoint recibe POST de Lemon Squeezy.' })
