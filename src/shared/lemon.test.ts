import { describe, expect, it } from 'vitest'
import {
  parseWebhook,
  signPayload,
  timingSafeEqualHex,
  verifySignature,
} from './lemon'

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

describe('parseWebhook', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    meta: {
      event_name: 'subscription_created',
      custom_data: { user_id: 'user-123' },
    },
    data: {
      id: '987654',
      type: 'subscriptions',
      attributes: {
        status: 'on_trial',
        customer_id: 4242,
        variant_id: 777,
        user_email: 'Dueno@Example.com',
        trial_ends_at: '2026-05-24T12:00:00.000000Z',
        renews_at: '2026-05-24T12:00:00.000000Z',
        ends_at: null,
        urls: {
          update_payment_method: 'https://lemon.test/update',
          customer_portal: 'https://lemon.test/portal',
        },
        ...over,
      },
    },
  })

  it('arma la fila de subscriptions desde el evento', () => {
    const parsed = parseWebhook(payload())!
    expect(parsed.event).toBe('subscription_created')
    expect(parsed.isSubscriptionEvent).toBe(true)
    expect(parsed.row).toEqual({
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
    })
  })

  it('el estado que manda es el de attributes.status, no el nombre del evento', () => {
    const p = { ...payload({ status: 'active' }) }
    p.meta.event_name = 'subscription_payment_success'
    expect(parseWebhook(p)!.row.status).toBe('active')
  })

  it('tolera que falte custom_data (después se busca por email)', () => {
    const p = payload()
    p.meta.custom_data = null as never
    const row = parseWebhook(p)!.row
    expect(row.user_id).toBeNull()
    expect(row.email).toBe('dueno@example.com')
  })

  it('marca como no-suscripción los eventos que no nos interesan', () => {
    const p = payload()
    p.meta.event_name = 'order_created'
    expect(parseWebhook(p)!.isSubscriptionEvent).toBe(false)
  })

  it('devuelve null si no hay nombre de evento', () => {
    expect(parseWebhook({})).toBeNull()
  })

  it('ignora fechas inválidas en lugar de guardar basura', () => {
    expect(parseWebhook(payload({ trial_ends_at: 'no-es-fecha' }))!.row.trial_ends_at).toBeNull()
  })
})
