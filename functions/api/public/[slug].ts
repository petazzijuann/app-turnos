/**
 * GET /api/public/:slug
 * Datos públicos del negocio para la página de reservas.
 */
import { db } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { cached, clientIp, notFound } from '../../_lib/http'
import { rateLimit, tooMany } from '../../_lib/rate'
import { findBusiness, publicPayload } from '../../_lib/booking'

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const slug = String(params.slug ?? '')
  const rl = await rateLimit(env, `biz:${clientIp(request)}`, 120, 60)
  if (!rl.ok) return tooMany(rl.retryAfter)

  const d = db(env)
  const biz = await findBusiness(d, slug)
  if (!biz) return notFound('No encontramos este negocio.')

  // 30 s en el borde: alcanza para que varios clientes abran la página rápido
  // y no tanto como para que un cambio de precio tarde en verse.
  return cached(await publicPayload(d, biz), 30)
}
