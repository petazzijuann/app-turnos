/**
 * COMPARTIDO · Lemon Squeezy: firma del webhook y lectura del evento.
 * Sin dependencias del runtime (usa Web Crypto): corre en Workers y en Node.
 */

/** Compara dos strings hex en tiempo constante (no filtra por dónde difieren). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  // La longitud sí se puede comparar directo: no es información útil.
  if (x.length !== y.length || x.length === 0) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** HMAC-SHA256 del body CRUDO (tal cual llegó) en hexadecimal. */
export async function signPayload(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
}

/**
 * Verifica el header X-Signature. Importante: hay que firmar el body crudo,
 * no el JSON re-serializado (cualquier diferencia de espacios rompe la firma).
 */
export async function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): Promise<boolean> {
  if (!signature || !secret) return false
  return timingSafeEqualHex(await signPayload(rawBody, secret), signature)
}

/* --------------------------------- Evento --------------------------------- */

export const LEMON_EVENTS = [
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_success',
  'subscription_payment_failed',
] as const

export type LemonEvent = (typeof LEMON_EVENTS)[number]

export type LemonWebhook = {
  meta?: {
    event_name?: string
    custom_data?: Record<string, unknown> | null
  }
  data?: {
    id?: string | number
    type?: string
    attributes?: Record<string, unknown> | null
  } | null
}

export type SubscriptionUpsert = {
  user_id: string | null
  email: string | null
  lemon_subscription_id: string | null
  lemon_customer_id: string | null
  variant_id: string | null
  status: string
  trial_ends_at: string | null
  renews_at: string | null
  ends_at: string | null
  update_payment_url: string | null
  customer_portal_url: string | null
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v)

const iso = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/**
 * Traduce el evento a la fila de `subscriptions`.
 * Los eventos de pago no cambian el estado por su cuenta: Lemon manda el
 * estado real en `attributes.status` y es el que manda.
 */
export function parseWebhook(payload: LemonWebhook): {
  event: string
  isSubscriptionEvent: boolean
  row: SubscriptionUpsert
} | null {
  const event = payload?.meta?.event_name ?? ''
  if (!event) return null

  const a = (payload.data?.attributes ?? {}) as Record<string, unknown>
  const urls = (a.urls ?? {}) as Record<string, unknown>
  const custom = (payload.meta?.custom_data ?? {}) as Record<string, unknown>

  // Lemon manda custom_data como string cuando viene del checkout.
  const userId = str(custom.user_id ?? custom.userId)

  const row: SubscriptionUpsert = {
    user_id: userId,
    email: str(a.user_email)?.toLowerCase() ?? null,
    lemon_subscription_id: str(payload.data?.id),
    lemon_customer_id: str(a.customer_id),
    variant_id: str(a.variant_id),
    status: str(a.status) ?? 'none',
    trial_ends_at: iso(a.trial_ends_at),
    renews_at: iso(a.renews_at),
    ends_at: iso(a.ends_at),
    update_payment_url: str(urls.update_payment_method),
    customer_portal_url: str(urls.customer_portal),
  }

  return {
    event,
    isSubscriptionEvent: (LEMON_EVENTS as readonly string[]).includes(event),
    row,
  }
}
