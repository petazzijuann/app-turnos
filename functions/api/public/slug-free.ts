/**
 * GET /api/public/slug-free?slug=mi-negocio
 * Chequea si un link de reservas está libre. No expone nada del negocio
 * (solo si existe y, si existe, su id, para que el dueño reconozca el propio).
 */
import { db } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { badRequest, clientIp, json } from '../../_lib/http'
import { rateLimit, tooMany } from '../../_lib/rate'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const slug = (new URL(request.url).searchParams.get('slug') ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(slug))
    return badRequest('El link solo puede tener letras, números y guiones.')

  const rl = await rateLimit(env, `slug:${clientIp(request)}`, 60, 60)
  if (!rl.ok) return tooMany(rl.retryAfter)

  const row = await db(env).one<{ id: string }>(
    'turnos_businesses',
    `select=id&slug=eq.${encodeURIComponent(slug)}`
  )
  return json({ free: !row, id: row?.id })
}
