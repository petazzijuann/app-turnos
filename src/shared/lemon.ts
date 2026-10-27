/**
 * COMPARTIDO · Lemon Squeezy: firma del webhook y lectura del evento.
 * Sin dependencias del runtime (usa Web Crypto): corre en Workers y en Node.
 *
 * Regla de oro: SOLO los objetos `data.type === 'subscriptions'` describen la
 * suscripción. Los eventos de pago traen `subscription-invoices`, cuyo
 * `attributes.status` es el de la FACTURA ('paid', 'failed', 'refunded'…) y no
 * tiene nada que ver con el estado del plan. Escribir eso en
 * `subscriptions.status` deja al usuario afuera de su propia cuenta.
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

/** Eventos que describen la suscripción: estos sí actualizan el estado. */
export const SUBSCRIPTION_EVENTS = [
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
] as const

/**
 * Eventos de facturación: NO tocan el estado del plan. Solo sirven para saber
 * qué suscripción conviene refrescar contra la API de Lemon.
 */
export const INVOICE_EVENTS = ['subscription_payment_success', 'subscription_payment_failed'] as const

export const LEMON_EVENTS = [...SUBSCRIPTION_EVENTS, ...INVOICE_EVENTS] as const

export type LemonEvent = (typeof LEMON_EVENTS)[number]

/** Estados reales de una suscripción en Lemon Squeezy. */
export const SUBSCRIPTION_STATUSES = [
  'on_trial',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'unpaid',
  'paused',
] as const

export const isKnownStatus = (s: string | null | undefined) =>
  !!s && (SUBSCRIPTION_STATUSES as readonly string[]).includes(s)

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
  /** `updated_at` que mandó Lemon: sirve para descartar eventos viejos. */
  lemon_updated_at: string | null
}

export type ParsedWebhook = {
  event: string
  /** 'subscriptions', 'subscription-invoices', … */
  objectType: string
  /** true si el evento describe la suscripción y puede cambiar el estado. */
  isSubscription: boolean
  /** true si es un evento de facturación (no toca el estado). */
  isInvoice: boolean
  /** Id de la suscripción, venga de data.id o de attributes.subscription_id. */
  subscriptionId: string | null
  /** user_id que viajó en el checkout, si vino. */
  userId: string | null
  /** Mail con el que pagó, para encontrar al usuario si falta el user_id. */
  email: string | null
  /** La fila a guardar. null cuando el evento no describe la suscripción. */
  row: SubscriptionUpsert | null
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
 * Qué clase de objeto trae el evento. Lemon lo dice en `data.type`; si no
 * viniera, se deduce del nombre del evento (nunca se asume "suscripción").
 */
export function objectTypeOf(payload: LemonWebhook, event: string): string {
  const declared = str(payload.data?.type)
  if (declared) return declared
  if ((INVOICE_EVENTS as readonly string[]).includes(event)) return 'subscription-invoices'
  if ((SUBSCRIPTION_EVENTS as readonly string[]).includes(event)) return 'subscriptions'
  return 'unknown'
}

/** Lee el evento sin decidir todavía qué hacer con él. */
export function parseWebhook(payload: LemonWebhook): ParsedWebhook | null {
  const event = payload?.meta?.event_name ?? ''
  if (!event) return null

  const a = (payload.data?.attributes ?? {}) as Record<string, unknown>
  const urls = (a.urls ?? {}) as Record<string, unknown>
  const custom = (payload.meta?.custom_data ?? {}) as Record<string, unknown>

  const objectType = objectTypeOf(payload, event)
  const isSubscription = objectType === 'subscriptions'
  const isInvoice = objectType === 'subscription-invoices'

  const userId = str(custom.user_id ?? custom.userId)
  const email = str(a.user_email)?.toLowerCase() ?? null

  // En una factura, data.id es el id de la FACTURA: la suscripción viene
  // aparte, en attributes.subscription_id.
  const subscriptionId = isSubscription
    ? str(payload.data?.id)
    : str(a.subscription_id) ?? null

  const base: ParsedWebhook = {
    event,
    objectType,
    isSubscription,
    isInvoice,
    subscriptionId,
    userId,
    email,
    row: null,
  }

  if (!isSubscription) return base

  return {
    ...base,
    row: {
      user_id: userId,
      email,
      lemon_subscription_id: subscriptionId,
      lemon_customer_id: str(a.customer_id),
      variant_id: str(a.variant_id),
      status: str(a.status) ?? 'none',
      trial_ends_at: iso(a.trial_ends_at),
      renews_at: iso(a.renews_at),
      ends_at: iso(a.ends_at),
      update_payment_url: str(urls.update_payment_method),
      customer_portal_url: str(urls.customer_portal),
      lemon_updated_at: iso(a.updated_at),
    },
  }
}

/**
 * Arma la fila a partir de lo que devuelve la API de Lemon
 * (GET /v1/subscriptions/:id), que tiene la misma forma que el webhook.
 */
export const rowFromApi = (payload: LemonWebhook): SubscriptionUpsert | null =>
  parseWebhook({ meta: { event_name: 'subscription_updated' }, data: payload.data })?.row ?? null

/* ------------------------------ Orden de eventos --------------------------- */

/**
 * Los webhooks pueden llegar desordenados (reintentos, red). Un evento más
 * viejo que lo guardado no debe pisar nada.
 *
 * Si alguno de los dos lados no trae fecha, se aplica: es preferible un dato
 * nuevo a quedarse con uno viejo del que no sabemos nada.
 */
export function isNewerThanStored(
  incoming: string | null | undefined,
  stored: string | null | undefined
): boolean {
  if (!incoming || !stored) return true
  const a = Date.parse(incoming)
  const b = Date.parse(stored)
  if (Number.isNaN(a) || Number.isNaN(b)) return true
  return a >= b
}

export type StoredSubscription = {
  status?: string | null
  lemon_updated_at?: string | null
} | null

export type Decision =
  | { apply: true; row: SubscriptionUpsert }
  | { apply: false; reason: 'no-es-suscripcion' | 'evento-viejo' | 'sin-datos' }

/**
 * Decide qué hacer con un evento ya parseado. Está acá, puro y sin red, para
 * poder testear secuencias completas de eventos.
 */
export function decide(parsed: ParsedWebhook | null, stored: StoredSubscription): Decision {
  if (!parsed) return { apply: false, reason: 'sin-datos' }
  if (!parsed.row) return { apply: false, reason: 'no-es-suscripcion' }
  if (!isNewerThanStored(parsed.row.lemon_updated_at, stored?.lemon_updated_at))
    return { apply: false, reason: 'evento-viejo' }
  return { apply: true, row: parsed.row }
}
