/**
 * GET /api/public/:slug/slots?service=&staff=&date=
 * Horarios libres de un día + qué días de la ventana tienen lugar.
 * La cuenta se hace en el servidor: el navegador nunca ve la agenda completa.
 */
import { availability, computeSlots, daysWithSlots, findBusiness } from '../../../_lib/booking'
import { db } from '../../../_lib/db'
import type { Env } from '../../../_lib/env'
import { badRequest, clientIp, json, notFound } from '../../../_lib/http'
import { rateLimit, tooMany } from '../../../_lib/rate'
import { addDays } from '../../../../src/shared/slots'
import { todayKey } from '../../../../src/shared/time'

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const url = new URL(request.url)
  const slug = String(params.slug ?? '')
  const serviceId = url.searchParams.get('service') ?? ''
  const staffId = url.searchParams.get('staff')
  const dateParam = url.searchParams.get('date')

  if (!serviceId) return badRequest('Falta el servicio.')
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return badRequest('Fecha inválida.')

  const rl = await rateLimit(env, `slots:${clientIp(request)}`, 120, 60)
  if (!rl.ok) return tooMany(rl.retryAfter)

  const d = db(env)
  const biz = await findBusiness(d, slug)
  if (!biz) return notFound('No encontramos este negocio.')

  const hoy = todayKey(biz.timezone)
  // Ventana: desde hoy hasta el máximo que permita el negocio (tope 60 días
  // para que la consulta no se vaya de las manos).
  const ventana = Math.min(Math.max(1, biz.max_days_ahead), 60)
  const date = dateParam && dateParam >= hoy ? dateParam : hoy
  const dentroDeVentana = date <= addDays(hoy, ventana - 1)
  if (!dentroDeVentana) return badRequest('Esa fecha está más allá de lo que se puede reservar.')

  const av = await availability(d, biz, { serviceId, staffId, fromDate: hoy, days: ventana })
  if (!av) return notFound('Ese servicio ya no está disponible.')

  return json({
    timezone: biz.timezone,
    date,
    slots: computeSlots({ ...av.base, date }),
    days: daysWithSlots(av.base, hoy, ventana),
  })
}
