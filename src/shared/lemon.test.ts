import { describe, expect, it, vi } from 'vitest'
import {
  decide,
  isNewerThanStored,
  parseWebhook,
  rowFromApi,
  signPayload,
  timingSafeEqualHex,
  verifySignature,
  type StoredSubscription,
  type SubscriptionUpsert,
} from './lemon'
import { accessFor } from './access'

const SECRET = 'un-secreto-de-prueba'

describe('firma del webhook', () => {
  it('acepta la firma correcta del body crudo', async () => {
    const body = '{"meta":{"event_name":"subscription_created"}}'
    const sig = await signPayload(body, SECRET)
    expect(await verifySignature(body, sig, SECRET)).toBe(true)
    expect(await verifySignature(body, sig.toUpperCase(), SECRET)).toBe(true)
  })

  it('rechaza si cambia un byte del body', async () => {
    const body = '{"meta":{"event_name":"subscription_created"}}'
    const sig = await signPayload(body, SECRET)
    expect(await verifySignature(body + ' ', sig, SECRET)).toBe(false)
    expect(await verifySignature('{"meta":{}}', sig, SECRET)).toBe(false)
  })

  it('rechaza con otro secreto, sin firma o sin secreto', async () => {
    const body = '{"a":1}'
    const sig = await signPayload(body, SECRET)
    expect(await verifySignature(body, sig, 'otro-secreto')).toBe(false)
    expect(await verifySignature(body, null, SECRET)).toBe(false)
    expect(await verifySignature(body, sig, undefined)).toBe(false)
    expect(await verifySignature(body, '', SECRET)).toBe(false)
  })

  it('es estable: la misma entrada da la misma firma', async () => {
    expect(await signPayload('x', SECRET)).toBe(await signPayload('x', SECRET))
    expect(await signPayload('x', SECRET)).toHaveLength(64)
  })

  it('timingSafeEqualHex compara bien y no se cuelga con largos distintos', () => {
    expect(timingSafeEqualHex('abcd', 'ABCD')).toBe(true)
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false)
    expect(timingSafeEqualHex('abcd', 'abcd0')).toBe(false)
    expect(timingSafeEqualHex('', '')).toBe(false)
  })
})

/* -------------------------- Payloads de ejemplo --------------------------- */

/** Evento de suscripción, tal como lo manda Lemon (data.type 'subscriptions'). */
const subscriptionEvent = (
  event: string,
  attrs: Record<string, unknown> = {},
  id = '987654'
) => ({
  meta: { event_name: event, custom_data: { user_id: 'user-123' } },
  data: {
    id,
    type: 'subscriptions',
    attributes: {
      status: 'on_trial',
      customer_id: 4242,
      variant_id: 777,
      user_email: 'Dueno@Example.com',
      trial_ends_at: '2026-05-24T12:00:00.000000Z',
      renews_at: '2026-05-24T12:00:00.000000Z',
      ends_at: null,
      updated_at: '2026-05-10T12:00:00.000000Z',
      urls: {
        update_payment_method: 'https://lemon.test/update',
        customer_portal: 'https://lemon.test/portal',
      },
      ...attrs,
    },
  },
})

/**
 * Evento de pago. OJO: data.type es 'subscription-invoices', data.id es el id
 * de la FACTURA y attributes.status es el de la factura ('paid'/'failed'),
 * NO el del plan.
 */
const invoiceEvent = (event: string, status = 'paid') => ({
  meta: { event_name: event, custom_data: { user_id: 'user-123' } },
  data: {
    id: '555000', // id de la factura, no de la suscripción
    type: 'subscription-invoices',
    attributes: {
      store_id: 1,
      subscription_id: 987654,
      customer_id: 4242,
      user_email: 'dueno@example.com',
      billing_reason: 'initial',
      status,
      status_formatted: status,
      total: 1500,
      updated_at: '2026-05-10T12:00:05.000000Z',
      urls: { invoice_url: 'https://lemon.test/invoice' },
    },
  },
})

/* ------------------------------- parseWebhook ----------------------------- */

describe('parseWebhook · eventos de suscripción', () => {
  it('arma la fila desde un objeto subscriptions', () => {
    const p = parseWebhook(subscriptionEvent('subscription_created'))!
    expect(p.event).toBe('subscription_created')
    expect(p.objectType).toBe('subscriptions')
    expect(p.isSubscription).toBe(true)
    expect(p.row).toEqual({
      user_id: 'user-123',
      email: 'dueno@example.com',
      lemon_subscription_id: '987654',
      lemon_customer_id: '4242',
      variant_id: '777',
      status: 'on_trial',
      trial_ends_at: '2026-05-24T12:00:00.000Z',
      renews_at: '2026-05-24T12:00:00.000Z',
      ends_at: null,
      update_payment_url: 'https://lemon.test/update',
      customer_portal_url: 'https://lemon.test/portal',
      lemon_updated_at: '2026-05-10T12:00:00.000Z',
    })
  })

  it('tolera que falte custom_data (después se busca por email)', () => {
    const e = subscriptionEvent('subscription_created')
    e.meta.custom_data = null as never
    const p = parseWebhook(e)!
    expect(p.userId).toBeNull()
    expect(p.email).toBe('dueno@example.com')
  })

  it('ignora fechas inválidas en lugar de guardar basura', () => {
    const p = parseWebhook(subscriptionEvent('subscription_updated', { trial_ends_at: 'ayer' }))!
    expect(p.row!.trial_ends_at).toBeNull()
  })
})

describe('parseWebhook · eventos de pago (la causa del bug)', () => {
  it('NO arma fila: una factura no describe el plan', () => {
    const p = parseWebhook(invoiceEvent('subscription_payment_success'))!
    expect(p.objectType).toBe('subscription-invoices')
    expect(p.isSubscription).toBe(false)
    expect(p.isInvoice).toBe(true)
    expect(p.row).toBeNull()
  })

  it('el status "paid" de la factura nunca llega a la fila', () => {
    const p = parseWebhook(invoiceEvent('subscription_payment_success', 'paid'))!
    expect(JSON.stringify(p.row)).not.toContain('paid')
  })

  it('saca el id de la suscripción de attributes.subscription_id, no de data.id', () => {
    const p = parseWebhook(invoiceEvent('subscription_payment_failed', 'failed'))!
    // data.id (555000) es la factura; la suscripción es la 987654.
    expect(p.subscriptionId).toBe('987654')
  })

  it('deduce el tipo por el nombre del evento si no viene data.type', () => {
    const e = invoiceEvent('subscription_payment_success') as {
      data: { type?: string }
    }
    delete e.data.type
    expect(parseWebhook(e as never)!.isSubscription).toBe(false)
  })

  it('un tipo desconocido tampoco escribe el estado', () => {
    const e = {
      meta: { event_name: 'order_created' },
      data: { id: '1', type: 'orders', attributes: { status: 'paid' } },
    }
    const p = parseWebhook(e)!
    expect(p.isSubscription).toBe(false)
    expect(p.row).toBeNull()
  })

  it('devuelve null si no hay nombre de evento', () => {
    expect(parseWebhook({})).toBeNull()
  })
})

/* ---------------------------- Orden de los eventos ------------------------- */

describe('eventos desordenados', () => {
  it('isNewerThanStored compara por fecha', () => {
    expect(isNewerThanStored('2026-05-10T12:00:00Z', '2026-05-10T11:00:00Z')).toBe(true)
    expect(isNewerThanStored('2026-05-10T10:00:00Z', '2026-05-10T11:00:00Z')).toBe(false)
    // Mismo instante: se aplica (reintento del mismo evento, idempotente).
    expect(isNewerThanStored('2026-05-10T11:00:00Z', '2026-05-10T11:00:00Z')).toBe(true)
  })

  it('si falta alguna fecha, se aplica el dato nuevo', () => {
    expect(isNewerThanStored(null, '2026-05-10T11:00:00Z')).toBe(true)
    expect(isNewerThanStored('2026-05-10T11:00:00Z', null)).toBe(true)
    expect(isNewerThanStored('cualquier cosa', '2026-05-10T11:00:00Z')).toBe(true)
  })

  it('un evento viejo que llega tarde NO pisa el estado nuevo', () => {
    const guardado: StoredSubscription = {
      status: 'active',
      lemon_updated_at: '2026-06-01T10:00:00.000Z',
    }
    // Llega tarde el "created" original, de tres semanas antes.
    const viejo = parseWebhook(
      subscriptionEvent('subscription_created', {
        status: 'on_trial',
        updated_at: '2026-05-10T12:00:00.000000Z',
      })
    )
    const d = decide(viejo, guardado)
    expect(d.apply).toBe(false)
    expect(d).toMatchObject({ reason: 'evento-viejo' })
  })

  it('un evento más nuevo sí se aplica', () => {
    const guardado: StoredSubscription = {
      status: 'on_trial',
      lemon_updated_at: '2026-05-10T12:00:00.000Z',
    }
    const nuevo = parseWebhook(
      subscriptionEvent('subscription_cancelled', {
        status: 'cancelled',
        ends_at: '2026-06-24T12:00:00.000000Z',
        updated_at: '2026-06-01T10:00:00.000000Z',
      })
    )
    const d = decide(nuevo, guardado)
    expect(d.apply).toBe(true)
    expect(d.apply && d.row.status).toBe('cancelled')
  })

  it('una factura nunca se aplica, por más nueva que sea', () => {
    const d = decide(parseWebhook(invoiceEvent('subscription_payment_success')), {
      status: 'on_trial',
      lemon_updated_at: '2020-01-01T00:00:00.000Z',
    })
    expect(d).toEqual({ apply: false, reason: 'no-es-suscripcion' })
  })
})

/* --------------------------- La secuencia del bug -------------------------- */

describe('secuencia real: activar la prueba en Lemon', () => {
  /** Aplica una lista de eventos como lo hace el webhook y devuelve la fila. */
  function reproducir(eventos: unknown[]) {
    let fila: (SubscriptionUpsert & { lemon_updated_at: string | null }) | null = null
    const saltados: string[] = []
    for (const e of eventos) {
      const parsed = parseWebhook(e as never)
      const d = decide(parsed, fila)
      if (d.apply) fila = d.row
      else saltados.push(`${parsed?.event}:${d.reason}`)
    }
    return { fila, saltados }
  }

  it('created(on_trial) → updated(on_trial) → payment_success(paid) termina en on_trial con acceso completo', () => {
    const { fila, saltados } = reproducir([
      subscriptionEvent('subscription_created', { updated_at: '2026-05-10T12:00:00.000000Z' }),
      subscriptionEvent('subscription_updated', { updated_at: '2026-05-10T12:00:03.000000Z' }),
      invoiceEvent('subscription_payment_success', 'paid'),
    ])

    expect(fila!.status).toBe('on_trial')
    expect(fila!.lemon_subscription_id).toBe('987654') // no el id de la factura
    expect(saltados).toEqual(['subscription_payment_success:no-es-suscripcion'])

    const acceso = accessFor(fila, new Date('2026-05-11T00:00:00Z'))
    expect(acceso.level).toBe('full')
    expect(acceso.accepting).toBe(true)
    expect(acceso.trialDaysLeft).toBe(14)
  })

  it('un pago fallido tampoco rompe el plan (el estado lo trae subscription_updated)', () => {
    const { fila } = reproducir([
      subscriptionEvent('subscription_created'),
      invoiceEvent('subscription_payment_failed', 'failed'),
    ])
    expect(fila!.status).toBe('on_trial')
    expect(accessFor(fila, new Date('2026-05-11T00:00:00Z')).level).toBe('full')
  })

  it('el past_due real sí llega por subscription_updated', () => {
    const { fila } = reproducir([
      subscriptionEvent('subscription_created'),
      invoiceEvent('subscription_payment_failed', 'failed'),
      subscriptionEvent('subscription_updated', {
        status: 'past_due',
        updated_at: '2026-05-25T12:00:00.000000Z',
      }),
    ])
    expect(fila!.status).toBe('past_due')
    const acceso = accessFor(fila, new Date('2026-05-25T13:00:00Z'))
    expect(acceso.level).toBe('full')
    expect(acceso.needsCard).toBe(true)
  })

  it('reaplicar el mismo evento dos veces deja lo mismo (idempotente)', () => {
    const e = subscriptionEvent('subscription_created')
    const unaVez = reproducir([e]).fila
    const dosVeces = reproducir([e, e]).fila
    expect(dosVeces).toEqual(unaVez)
  })
})

describe('rowFromApi', () => {
  it('lee la respuesta de GET /v1/subscriptions/:id igual que el webhook', () => {
    const api = { data: subscriptionEvent('x', { status: 'active' }).data }
    const row = rowFromApi(api as never)!
    expect(row.status).toBe('active')
    expect(row.lemon_subscription_id).toBe('987654')
  })

  it('devuelve null si la respuesta no es una suscripción', () => {
    expect(rowFromApi({ data: { id: '1', type: 'orders', attributes: {} } })).toBeNull()
  })
})

/* ------------------- Estados desconocidos: no bloquear ------------------- */

describe('un estado desconocido no deja a nadie afuera si el plan está vigente', () => {
  const futuro = new Date('2026-06-01T12:00:00Z')

  it('"paid" guardado por la versión vieja del webhook: entra igual', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = accessFor(
      { status: 'paid', renews_at: '2026-07-01T12:00:00Z' },
      futuro
    )
    expect(a.level).toBe('full')
    expect(a.accepting).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"paid"'))
    warn.mockRestore()
  })

  it('con la prueba todavía corriendo, también entra', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      accessFor({ status: 'algo_nuevo', trial_ends_at: '2026-06-15T12:00:00Z' }, futuro).level
    ).toBe('full')
    warn.mockRestore()
  })

  it('sin ninguna fecha vigente sí queda en solo lectura', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = accessFor({ status: 'paid', renews_at: '2026-01-01T12:00:00Z' }, futuro)
    expect(a.level).toBe('readonly')
    expect(a.accepting).toBe(false)
    warn.mockRestore()
  })
})
