/**
 * FUNCTIONS · Datos y disponibilidad de un negocio.
 * La cuenta de los horarios la hace `computeSlots` (src/shared/slots.ts), la
 * misma función pura que usan los tests y el front.
 */
import { acceptsBookings } from '../../src/shared/access'
import {
  addDays,
  computeSlots,
  daysWithSlots,
  type SlotsInput,
  type StaffAvailability,
} from '../../src/shared/slots'
import type { PublicBusiness } from '../../src/shared/types'
import { db, type Db } from './db'
import { APP } from './env'

export type BizRow = {
  id: string
  owner_id: string
  slug: string
  name: string
  category: string
  logo_url: string | null
  address: string | null
  whatsapp: string | null
  timezone: string
  color: string
  welcome_message: string | null
  min_notice_hours: number
  max_days_ahead: number
  slot_step_min: number
  cancel_window_hours: number
  active: boolean
}

export type ServiceRow = {
  id: string
  name: string
  duration_min: number
  price: number | null
  description: string | null
}

export type StaffRow = { id: string; name: string; photo_url: string | null; sort_order: number }

const BIZ_FIELDS =
  'id,owner_id,slug,name,category,logo_url,address,whatsapp,timezone,color,welcome_message,' +
  'min_notice_hours,max_days_ahead,slot_step_min,cancel_window_hours,active'

/** Negocio por slug (siempre en minúsculas) o null. */
export const findBusiness = (d: Db, slug: string) =>
  d.one<BizRow>(
    'turnos_businesses',
    `select=${BIZ_FIELDS}&slug=eq.${encodeURIComponent(slug.trim().toLowerCase())}`
  )

/**
 * ¿Toma reservas online? Hace falta que el dueño tenga plan activo (o en
 * prueba) y que no haya pausado su página a mano.
 */
export async function isAccepting(d: Db, biz: BizRow): Promise<boolean> {
  if (!biz.active) return false
  const sub = await d.one<{
    status: string
    trial_ends_at: string | null
    ends_at: string | null
  }>(
    'subscriptions',
    `select=status,trial_ends_at,ends_at&user_id=eq.${biz.owner_id}&app=eq.${APP}`
  )
  return acceptsBookings(sub)
}

/** Datos públicos del negocio para la página de reservas. */
export async function publicPayload(d: Db, biz: BizRow): Promise<PublicBusiness> {
  const [services, staff, accepting] = await Promise.all([
    d.select<ServiceRow>(
      'turnos_services',
      `select=id,name,duration_min,price,description&business_id=eq.${biz.id}&active=is.true&order=sort_order`
    ),
    d.select<StaffRow>(
      'turnos_staff',
      `select=id,name,photo_url,sort_order&business_id=eq.${biz.id}&active=is.true&order=sort_order`
    ),
    isAccepting(d, biz),
  ])

  // Quién hace qué: se pide después porque necesita los ids de las personas.
  const staffIds = staff.map((s) => s.id)
  const realLinks =
    staffIds.length === 0
      ? []
      : await d.select<{ staff_id: string; service_id: string }>(
          'turnos_staff_services',
          `select=staff_id,service_id&staff_id=in.(${staffIds.join(',')})`
        )

  const byStaff: Record<string, string[]> = {}
  for (const l of realLinks) (byStaff[l.staff_id] ??= []).push(l.service_id)

  return {
    slug: biz.slug,
    name: biz.name,
    category: biz.category,
    logo_url: biz.logo_url,
    address: biz.address,
    whatsapp: biz.whatsapp,
    timezone: biz.timezone,
    color: biz.color,
    welcome_message: biz.welcome_message,
    min_notice_hours: biz.min_notice_hours,
    max_days_ahead: biz.max_days_ahead,
    cancel_window_hours: biz.cancel_window_hours,
    accepting,
    services,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      photo_url: s.photo_url,
      service_ids: byStaff[s.id] ?? [],
    })),
  }
}

/**
 * Arma la disponibilidad real de un rango de días: horario semanal menos
 * bloqueos menos turnos tomados, por persona.
 */
export async function availability(
  d: Db,
  biz: BizRow,
  opts: {
    serviceId: string
    staffId?: string | null
    /** 'YYYY-MM-DD' en hora del negocio. */
    fromDate: string
    days: number
  }
): Promise<{ service: ServiceRow; base: Omit<SlotsInput, 'date'> } | null> {
  const service = await d.one<ServiceRow>(
    'turnos_services',
    `select=id,name,duration_min,price,description&id=eq.${opts.serviceId}&business_id=eq.${biz.id}&active=is.true`
  )
  if (!service) return null

  const staff = await d.select<StaffRow>(
    'turnos_staff',
    `select=id,name,photo_url,sort_order&business_id=eq.${biz.id}&active=is.true&order=sort_order`
  )
  const staffIds = staff.map((s) => s.id)
  if (staffIds.length === 0) {
    return { service, base: emptyBase(biz, service) }
  }

  const links = await d.select<{ staff_id: string; service_id: string }>(
    'turnos_staff_services',
    `select=staff_id,service_id&staff_id=in.(${staffIds.join(',')})`
  )
  const byStaff: Record<string, string[]> = {}
  for (const l of links) (byStaff[l.staff_id] ??= []).push(l.service_id)

  // Quién puede hacer este servicio (sin links = lo hace todo el mundo).
  const alguienTieneLinks = staff.some((s) => (byStaff[s.id]?.length ?? 0) > 0)
  let candidatos = staff.filter(
    (s) => !alguienTieneLinks || (byStaff[s.id] ?? []).includes(service.id)
  )
  if (opts.staffId) candidatos = candidatos.filter((s) => s.id === opts.staffId)
  if (candidatos.length === 0) return { service, base: emptyBase(biz, service) }

  // Rango real que hay que mirar (un día de más a cada lado por las zonas).
  const from = new Date(`${addDays(opts.fromDate, -1)}T00:00:00Z`)
  const to = new Date(`${addDays(opts.fromDate, opts.days + 1)}T00:00:00Z`)
  const ids = candidatos.map((s) => s.id)

  const [hours, timeOff, busy] = await Promise.all([
    d.select<{ staff_id: string; weekday: number; start_time: string; end_time: string }>(
      'turnos_hours',
      `select=staff_id,weekday,start_time,end_time&staff_id=in.(${ids.join(',')})`
    ),
    d.select<{ staff_id: string | null; starts_at: string; ends_at: string }>(
      'turnos_time_off',
      `select=staff_id,starts_at,ends_at&business_id=eq.${biz.id}` +
        `&starts_at=lt.${to.toISOString()}&ends_at=gt.${from.toISOString()}`
    ),
    d.select<{ staff_id: string; starts_at: string; ends_at: string }>(
      'turnos_appointments',
      `select=staff_id,starts_at,ends_at&business_id=eq.${biz.id}&status=neq.cancelled` +
        `&starts_at=lt.${to.toISOString()}&ends_at=gt.${from.toISOString()}`
    ),
  ])

  const staffAvail: StaffAvailability[] = candidatos.map((s) => ({
    staffId: s.id,
    hours: hours
      .filter((h) => h.staff_id === s.id)
      .map((h) => ({ weekday: h.weekday, start: h.start_time, end: h.end_time })),
    busy: [
      ...busy.filter((b) => b.staff_id === s.id).map((b) => ({ start: b.starts_at, end: b.ends_at })),
      ...timeOff
        .filter((t) => t.staff_id === null || t.staff_id === s.id)
        .map((t) => ({ start: t.starts_at, end: t.ends_at })),
    ],
  }))

  return {
    service,
    base: {
      timezone: biz.timezone,
      durationMin: service.duration_min,
      stepMin: biz.slot_step_min,
      minNoticeHours: biz.min_notice_hours,
      now: new Date(),
      staff: staffAvail,
    },
  }
}

const emptyBase = (biz: BizRow, service: ServiceRow): Omit<SlotsInput, 'date'> => ({
  timezone: biz.timezone,
  durationMin: service.duration_min,
  stepMin: biz.slot_step_min,
  minNoticeHours: biz.min_notice_hours,
  now: new Date(),
  staff: [],
})

export { computeSlots, daysWithSlots, db }
