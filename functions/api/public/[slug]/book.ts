/**
 * POST /api/public/:slug/book
 * Reserva un turno desde la página pública.
 *   1. rate limit por IP           4. recalcula la disponibilidad
 *   2. valida el formulario        5. inserta (la base impide superposiciones)
 *   3. valida Turnstile            6. manda el mail de confirmación (si hay)
 */
import { availability, computeSlots, findBusiness, isAccepting } from '../../../_lib/booking'
import { db, isOverlap } from '../../../_lib/db'
import { appOrigin, type Env } from '../../../_lib/env'
import { badRequest, clean, clientIp, fail, json, notFound, readJson } from '../../../_lib/http'
import { rateLimit, tooMany } from '../../../_lib/rate'
import { confirmationEmail, sendMail, toBase64 } from '../../../_lib/resend'
import { pickStaff } from '../../../../src/shared/slots'
import { buildIcs } from '../../../../src/shared/ics'
import { dayKey, hhmm, longDay } from '../../../../src/shared/time'
import type { BookRequest } from '../../../../src/shared/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env, waitUntil }) => {
  const ip = clientIp(request)
  const slug = String(params.slug ?? '')

  // Dos límites: uno por minuto (clicks nerviosos) y uno por hora (abuso).
  for (const [key, limit, win] of [
    [`book:m:${ip}`, 5, 60],
    [`book:h:${ip}`, 20, 3600],
  ] as const) {
    const rl = await rateLimit(env, key, limit, win)
    if (!rl.ok) return tooMany(rl.retryAfter)
  }

  const body = await readJson<BookRequest>(request)
  if (!body) return badRequest('No pudimos leer el formulario.')

  const name = clean(body.name, 80)
  const phone = clean(body.phone, 24).replace(/[^\d+]/g, '')
  const email = clean(body.email, 120).toLowerCase()
  const notes = clean(body.notes, 500)
  const start = clean(body.start, 40)

  if (name.length < 2) return badRequest('Decinos tu nombre.')
  if (phone.replace(/\D/g, '').length < 8) return badRequest('Revisá tu teléfono.')
  if (email && !EMAIL_RE.test(email)) return badRequest('Revisá tu email.')
  if (!body.service_id) return badRequest('Elegí un servicio.')
  if (Number.isNaN(Date.parse(start))) return badRequest('Elegí un horario.')

  const { verifyTurnstile } = await import('../../../_lib/turnstile')
  const ts = await verifyTurnstile(env, clean(body.turnstile_token, 2048), ip)
  if (!ts.ok) return fail(400, 'No pudimos verificar que no seas un robot. Recargá y probá de nuevo.')

  const d = db(env)
  const biz = await findBusiness(d, slug)
  if (!biz) return notFound('No encontramos este negocio.')
  if (!(await isAccepting(d, biz)))
    return fail(403, 'Este negocio no está recibiendo reservas online en este momento.')

  const date = dayKey(start, biz.timezone)
  const av = await availability(d, biz, {
    serviceId: body.service_id,
    staffId: body.staff_id ?? null,
    fromDate: date,
    days: 1,
  })
  if (!av) return notFound('Ese servicio ya no está disponible.')

  const slots = computeSlots({ ...av.base, date })
  const startIso = new Date(start).toISOString()
  const slot = slots.find((s) => s.start === startIso)

  const otros = () => ({ slots: slots.filter((s) => s.start !== startIso).map((s) => ({ start: s.start, end: s.end })) })

  if (!slot || slot.staffIds.length === 0)
    return fail(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.', otros())

  // "Cualquiera": le toca a quien tenga menos turnos ese día.
  const carga: Record<string, number> = {}
  for (const person of av.base.staff) {
    carga[person.staffId] = person.busy.filter(
      (b) => dayKey(b.start as string, biz.timezone) === date
    ).length
  }
  const staffId =
    body.staff_id && slot.staffIds.includes(body.staff_id)
      ? body.staff_id
      : pickStaff(slot.staffIds, carga, av.base.staff.map((s) => s.staffId))
  if (!staffId) return fail(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.', otros())

  // Cliente: por teléfono, para no duplicar la ficha en cada reserva.
  const existente = await d.one<{ id: string; name: string; email: string | null }>(
    'turnos_clients',
    `select=id,name,email&business_id=eq.${biz.id}&phone=eq.${encodeURIComponent(phone)}`
  )
  let clientId = existente?.id
  if (existente) {
    if (email && !existente.email) {
      await d.update('turnos_clients', `id=eq.${existente.id}`, { email })
    }
  } else {
    const [nuevo] = await d.insert<{ id: string }>(
      'turnos_clients',
      { business_id: biz.id, name, phone, email: email || null },
      'id'
    )
    clientId = nuevo?.id
  }

  const staffName =
    (
      await d.one<{ name: string }>('turnos_staff', `select=name&id=eq.${staffId}`)
    )?.name ?? ''

  let appt: { id: string; manage_token: string; starts_at: string; ends_at: string }
  try {
    const [row] = await d.insert<{
      id: string
      manage_token: string
      starts_at: string
      ends_at: string
    }>(
      'turnos_appointments',
      {
        business_id: biz.id,
        staff_id: staffId,
        service_id: av.service.id,
        client_id: clientId,
        starts_at: slot.start,
        ends_at: slot.end,
        status: 'confirmed',
        source: 'online',
        price: av.service.price,
        notes: notes || null,
      },
      'id,manage_token,starts_at,ends_at'
    )
    if (!row) throw new Error('sin fila')
    appt = row
  } catch (e) {
    // La restricción EXCLUDE de la base es la última palabra: si dos personas
    // reservaron el mismo segundo, una recibe esto.
    if (isOverlap(e))
      return fail(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.', otros())
    return fail(500, 'No pudimos guardar el turno. Probá de nuevo en un momento.')
  }

  const origin = appOrigin(env, request)
  const manage = `${origin}/c/${appt.manage_token}`
  const tz = biz.timezone

  // El mail es un extra: no debe demorar la respuesta.
  if (email) {
    const owner = await d.one<{ email: string | null }>(
      'profiles',
      `select=email&id=eq.${biz.owner_id}`
    )
    const whenLong = longDay(appt.starts_at, tz)
    const time = hhmm(appt.starts_at, tz)
    const mail = confirmationEmail({
      businessName: biz.name,
      clientName: name,
      service: av.service.name,
      staff: staffName,
      whenLong,
      time,
      address: biz.address,
      manageUrl: manage,
      welcome: biz.welcome_message,
    })
    const ics = buildIcs({
      uid: `${appt.manage_token}@turnos.futurislabs.net`,
      start: appt.starts_at,
      end: appt.ends_at,
      title: `${av.service.name} · ${biz.name}`,
      description: `Turno con ${staffName}. Para confirmar o cancelar: ${manage}`,
      location: biz.address ?? undefined,
      url: manage,
      organizerEmail: owner?.email ?? undefined,
    })
    waitUntil(
      sendMail(env, {
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: owner?.email ?? undefined,
        attachments: [
          { filename: 'turno.ics', content: toBase64(ics), contentType: 'text/calendar' },
        ],
      })
    )
  }

  return json({
    ok: true,
    token: appt.manage_token,
    appointment: {
      start: appt.starts_at,
      end: appt.ends_at,
      service: av.service.name,
      staff: staffName,
      business: biz.name,
      address: biz.address,
      timezone: tz,
    },
  })
}
