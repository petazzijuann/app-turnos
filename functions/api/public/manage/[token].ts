/**
 * GET  /api/public/manage/:token  -> datos del turno del cliente
 * POST /api/public/manage/:token  -> { action: 'confirm' | 'cancel' }
 * El token es la llave: no hay login. Por eso se devuelve lo mínimo.
 */
import { db } from '../../../_lib/db'
import type { Env } from '../../../_lib/env'
import { badRequest, clean, clientIp, fail, json, notFound, readJson } from '../../../_lib/http'
import { rateLimit, tooMany } from '../../../_lib/rate'
import type { ManageResponse } from '../../../../src/shared/types'

type Row = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  turnos_services: { name: string } | null
  turnos_staff: { name: string } | null
  turnos_clients: { name: string } | null
  turnos_businesses: {
    name: string
    slug: string
    address: string | null
    whatsapp: string | null
    timezone: string
    cancel_window_hours: number
  } | null
}

const SELECT =
  'id,status,starts_at,ends_at,' +
  'turnos_services(name),turnos_staff(name),turnos_clients(name),' +
  'turnos_businesses(name,slug,address,whatsapp,timezone,cancel_window_hours)'

const find = (env: Env, token: string) =>
  db(env).one<Row>(
    'turnos_appointments',
    `select=${encodeURIComponent(SELECT)}&manage_token=eq.${encodeURIComponent(token)}`
  )

function payload(row: Row): ManageResponse {
  const biz = row.turnos_businesses
  const ventana = biz?.cancel_window_hours ?? 0
  const limite = new Date(row.starts_at).getTime() - ventana * 3600_000
  return {
    status: row.status as ManageResponse['status'],
    start: row.starts_at,
    end: row.ends_at,
    service: row.turnos_services?.name ?? 'Turno',
    staff: row.turnos_staff?.name ?? '',
    client: row.turnos_clients?.name ?? '',
    business: {
      name: biz?.name ?? '',
      slug: biz?.slug ?? '',
      address: biz?.address ?? null,
      whatsapp: biz?.whatsapp ?? null,
      timezone: biz?.timezone ?? 'UTC',
    },
    can_cancel:
      (row.status === 'confirmed' || row.status === 'pending') && Date.now() < limite,
    cancel_window_hours: ventana,
  }
}

const tokenOf = (v: unknown) => clean(v, 64).replace(/[^a-zA-Z0-9]/g, '')

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const token = tokenOf(params.token)
  if (!token) return badRequest('Link inválido.')

  const rl = await rateLimit(env, `manage:${clientIp(request)}`, 60, 60)
  if (!rl.ok) return tooMany(rl.retryAfter)

  const row = await find(env, token)
  if (!row) return notFound('No encontramos este turno.')
  return json(payload(row))
}

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const token = tokenOf(params.token)
  if (!token) return badRequest('Link inválido.')

  const rl = await rateLimit(env, `manage-post:${clientIp(request)}`, 20, 60)
  if (!rl.ok) return tooMany(rl.retryAfter)

  const body = await readJson<{ action?: string }>(request)
  const action = body?.action
  if (action !== 'cancel' && action !== 'confirm') return badRequest('Acción desconocida.')

  const row = await find(env, token)
  if (!row) return notFound('No encontramos este turno.')

  const info = payload(row)
  if (row.status === 'cancelled') return fail(409, 'Este turno ya estaba cancelado.')
  if (row.status === 'completed' || row.status === 'no_show')
    return fail(409, 'Este turno ya pasó.')

  if (action === 'cancel' && !info.can_cancel)
    return fail(
      403,
      `Ya pasó el límite para cancelar online (${info.cancel_window_hours} h antes). Escribile al negocio.`
    )

  const [updated] = await db(env).update<{ status: string }>(
    'turnos_appointments',
    `manage_token=eq.${encodeURIComponent(token)}`,
    { status: action === 'cancel' ? 'cancelled' : 'confirmed' },
    'status'
  )

  return json({ ...info, status: (updated?.status ?? info.status) as ManageResponse['status'], can_cancel: action !== 'cancel' && info.can_cancel })
}
