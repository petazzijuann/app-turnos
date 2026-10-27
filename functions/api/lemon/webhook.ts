/**
 * POST /api/lemon/webhook
 * Webhook de Lemon Squeezy. Verifica la firma X-Signature (HMAC-SHA256 del
 * body CRUDO, comparación en tiempo constante) y hace upsert en
 * `subscriptions`. Idempotente: el mismo evento dos veces deja lo mismo.
 */
import { db } from '../../_lib/db'
import { APP, type Env } from '../../_lib/env'
import { json } from '../../_lib/http'
import { parseWebhook, verifySignature, type LemonWebhook } from '../../../src/shared/lemon'

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

  let payload: LemonWebhook
  try {
    payload = JSON.parse(raw) as LemonWebhook
  } catch {
    return json({ error: 'body inválido' }, { status: 400 })
  }

  const parsed = parseWebhook(payload)
  if (!parsed) return json({ ok: true, ignored: 'sin evento' })
  if (!parsed.isSubscriptionEvent) return json({ ok: true, ignored: parsed.event })

  const d = db(env)
  const row = parsed.row

  // El user_id viene del checkout (checkout[custom][user_id]). Si por algo no
  // llegó, se busca por el mail con el que pagó.
  let userId = row.user_id
  if (!userId && row.email) {
    const profile = await d.one<{ id: string }>(
      'profiles',
      `select=id&email=eq.${encodeURIComponent(row.email)}`
    )
    userId = profile?.id ?? null
  }

  if (!userId) {
    // Sin usuario no hay dónde guardarla. Se responde 200 para que Lemon no
    // reintente para siempre, pero queda el log para investigarlo.
    console.error('Webhook sin user_id ni perfil para', row.email, parsed.event)
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
