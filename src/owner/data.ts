/**
 * APP DEL DUEÑO · Acceso a datos.
 * Todo pasa por Supabase con la anon key: la RLS garantiza que cada dueño
 * solo ve y toca lo de sus negocios.
 */
import { supabase } from '../saas/supabase'
import type {
  Appointment,
  AppointmentFull,
  AppointmentStatus,
  Business,
  Client,
  HourRow,
  Service,
  Staff,
  TimeOff,
} from '../shared/types'

export class DataError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

/** Traduce los errores de Postgres a algo que se pueda leer. */
export function dbMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  const code = err?.code ?? ''
  const msg = err?.message ?? ''
  if (code === '23P01' || msg.includes('turnos_appointments_no_overlap'))
    return 'Esa persona ya tiene un turno a esa hora.'
  if (code === '23505' || msg.includes('turnos_businesses_slug_key'))
    return 'Ese link ya está usado por otro negocio. Probá otro.'
  if (code === '23505' && msg.includes('turnos_clients_business_phone_key'))
    return 'Ya tenés un cliente con ese teléfono.'
  if (code === '23514') return 'Hay un dato fuera de rango. Revisá el formulario.'
  if (code === '42501' || msg.includes('row-level security'))
    return 'No tenés permiso para hacer ese cambio.'
  if (msg.toLowerCase().includes('failed to fetch')) return 'Sin conexión. Probá de nuevo.'
  return msg || 'No pudimos guardar el cambio.'
}

const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw new DataError(dbMessage(error), (error as { code?: string }).code)
  return data as T
}

/* ------------------------------- Negocio ------------------------------- */

export async function loadMyBusiness(): Promise<Business | null> {
  const { data, error } = await supabase
    .from('turnos_businesses')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new DataError(dbMessage(error))
  return (data as Business | null) ?? null
}

export async function slugAvailable(slug: string, exceptId?: string): Promise<boolean> {
  const clean = slug.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(clean)) return false
  // Se consulta por la API pública: la RLS no nos deja ver negocios ajenos.
  const res = await fetch(`/api/public/slug-free?slug=${encodeURIComponent(clean)}`)
  if (!res.ok) return false
  const body = (await res.json()) as { free: boolean; id?: string }
  return body.free || (!!exceptId && body.id === exceptId)
}

export const createBusiness = async (b: Partial<Business>) =>
  unwrap(await supabase.from('turnos_businesses').insert(b).select('*').single()) as Business

export const updateBusiness = async (id: string, patch: Partial<Business>) =>
  unwrap(
    await supabase.from('turnos_businesses').update(patch).eq('id', id).select('*').single()
  ) as Business

/* -------------------------------- Personas ------------------------------- */

export const loadStaff = async (businessId: string) =>
  unwrap(
    await supabase
      .from('turnos_staff')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order')
  ) as Staff[]

export const createStaff = async (s: Partial<Staff>) =>
  unwrap(await supabase.from('turnos_staff').insert(s).select('*').single()) as Staff

export const updateStaff = async (id: string, patch: Partial<Staff>) =>
  unwrap(await supabase.from('turnos_staff').update(patch).eq('id', id).select('*').single()) as Staff

export const deleteStaff = async (id: string) => {
  const { error } = await supabase.from('turnos_staff').delete().eq('id', id)
  if (error) throw new DataError(dbMessage(error))
}

/* ------------------------------- Servicios ------------------------------- */

export const loadServices = async (businessId: string) =>
  unwrap(
    await supabase
      .from('turnos_services')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order')
  ) as Service[]

export const createService = async (s: Partial<Service>) =>
  unwrap(await supabase.from('turnos_services').insert(s).select('*').single()) as Service

export const updateService = async (id: string, patch: Partial<Service>) =>
  unwrap(
    await supabase.from('turnos_services').update(patch).eq('id', id).select('*').single()
  ) as Service

export const deleteService = async (id: string) => {
  const { error } = await supabase.from('turnos_services').delete().eq('id', id)
  if (error) throw new DataError(dbMessage(error))
}

/** Quién hace qué. Sin filas para un servicio = lo hacen todas las personas. */
export const loadStaffServices = async (staffIds: string[]) => {
  if (staffIds.length === 0) return []
  return unwrap(
    await supabase.from('turnos_staff_services').select('*').in('staff_id', staffIds)
  ) as { staff_id: string; service_id: string }[]
}

export async function setStaffServices(staffId: string, serviceIds: string[]) {
  const { error: delErr } = await supabase
    .from('turnos_staff_services')
    .delete()
    .eq('staff_id', staffId)
  if (delErr) throw new DataError(dbMessage(delErr))
  if (serviceIds.length === 0) return
  const { error } = await supabase
    .from('turnos_staff_services')
    .insert(serviceIds.map((service_id) => ({ staff_id: staffId, service_id })))
  if (error) throw new DataError(dbMessage(error))
}

/* -------------------------------- Horarios ------------------------------- */

export const loadHours = async (businessId: string) =>
  unwrap(
    await supabase
      .from('turnos_hours')
      .select('*')
      .eq('business_id', businessId)
      .order('weekday')
      .order('start_time')
  ) as HourRow[]

/** Reemplaza el horario completo de una persona (es lo que edita la pantalla). */
export async function replaceHours(
  businessId: string,
  staffId: string,
  blocks: { weekday: number; start_time: string; end_time: string }[]
) {
  const { error: delErr } = await supabase.from('turnos_hours').delete().eq('staff_id', staffId)
  if (delErr) throw new DataError(dbMessage(delErr))
  if (blocks.length === 0) return
  const { error } = await supabase
    .from('turnos_hours')
    .insert(blocks.map((b) => ({ ...b, business_id: businessId, staff_id: staffId })))
  if (error) throw new DataError(dbMessage(error))
}

/* -------------------------------- Bloqueos ------------------------------- */

export const loadTimeOff = async (businessId: string) =>
  unwrap(
    await supabase
      .from('turnos_time_off')
      .select('*')
      .eq('business_id', businessId)
      .order('starts_at', { ascending: false })
  ) as TimeOff[]

export const createTimeOff = async (t: Partial<TimeOff>) =>
  unwrap(await supabase.from('turnos_time_off').insert(t).select('*').single()) as TimeOff

export const deleteTimeOff = async (id: string) => {
  const { error } = await supabase.from('turnos_time_off').delete().eq('id', id)
  if (error) throw new DataError(dbMessage(error))
}

/* -------------------------------- Clientes ------------------------------- */

export const loadClients = async (businessId: string, search = '') => {
  let q = supabase
    .from('turnos_clients')
    .select('*')
    .eq('business_id', businessId)
    .order('name')
    .limit(500)
  if (search.trim()) {
    const s = `%${search.trim()}%`
    q = q.or(`name.ilike.${s},phone.ilike.${s},email.ilike.${s}`)
  }
  return unwrap(await q) as Client[]
}

export const createClient = async (c: Partial<Client>) =>
  unwrap(await supabase.from('turnos_clients').insert(c).select('*').single()) as Client

export const updateClient = async (id: string, patch: Partial<Client>) =>
  unwrap(
    await supabase.from('turnos_clients').update(patch).eq('id', id).select('*').single()
  ) as Client

/** Busca por teléfono y si no existe lo crea (lo usa el turno manual). */
export async function upsertClient(
  businessId: string,
  c: { name: string; phone: string; email?: string | null }
): Promise<Client> {
  const { data: found, error } = await supabase
    .from('turnos_clients')
    .select('*')
    .eq('business_id', businessId)
    .eq('phone', c.phone)
    .maybeSingle()
  if (error) throw new DataError(dbMessage(error))
  if (found) {
    const prev = found as Client
    // Si cambió el nombre o sumó el mail, lo actualizamos.
    if ((c.name && c.name !== prev.name) || (c.email && c.email !== prev.email)) {
      return updateClient(prev.id, { name: c.name || prev.name, email: c.email ?? prev.email })
    }
    return prev
  }
  return createClient({ business_id: businessId, ...c })
}

/* --------------------------------- Turnos -------------------------------- */

const APPT_SELECT =
  '*, staff:turnos_staff(id,name), service:turnos_services(id,name,duration_min,price), client:turnos_clients(id,name,phone,email,notes)'

export const loadAppointments = async (businessId: string, from: Date, to: Date) =>
  unwrap(
    await supabase
      .from('turnos_appointments')
      .select(APPT_SELECT)
      .eq('business_id', businessId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at')
  ) as AppointmentFull[]

export const loadClientHistory = async (clientId: string) =>
  unwrap(
    await supabase
      .from('turnos_appointments')
      .select(APPT_SELECT)
      .eq('client_id', clientId)
      .order('starts_at', { ascending: false })
      .limit(100)
  ) as AppointmentFull[]

export const createAppointment = async (a: Partial<Appointment>) =>
  unwrap(
    await supabase.from('turnos_appointments').insert(a).select(APPT_SELECT).single()
  ) as AppointmentFull

export const updateAppointment = async (id: string, patch: Partial<Appointment>) =>
  unwrap(
    await supabase.from('turnos_appointments').update(patch).eq('id', id).select(APPT_SELECT).single()
  ) as AppointmentFull

export const setAppointmentStatus = (id: string, status: AppointmentStatus) =>
  updateAppointment(id, { status })

export const markReminded = (id: string) =>
  updateAppointment(id, { reminded_at: new Date().toISOString() })

export const deleteAppointment = async (id: string) => {
  const { error } = await supabase.from('turnos_appointments').delete().eq('id', id)
  if (error) throw new DataError(dbMessage(error))
}

/** Turnos de un rango sin cancelar, para calcular disponibilidad en el front. */
export const loadBusy = async (businessId: string, from: Date, to: Date) =>
  unwrap(
    await supabase
      .from('turnos_appointments')
      .select('id, staff_id, starts_at, ends_at')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
  ) as { id: string; staff_id: string; starts_at: string; ends_at: string }[]

/* -------------------------------- Imágenes ------------------------------- */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/** Sube una imagen al bucket público, siempre dentro de la carpeta del negocio. */
export async function uploadImage(
  businessId: string,
  file: File,
  kind: 'logo' | 'staff'
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new DataError('Ese archivo no es una imagen.')
  if (file.size > MAX_IMAGE_BYTES) throw new DataError('La imagen no puede pasar de 2 MB.')
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${businessId}/${kind}-${Date.now()}.${ext || 'jpg'}`
  const { error } = await supabase.storage
    .from('turnos-public')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '31536000' })
  if (error) throw new DataError(dbMessage(error))
  return supabase.storage.from('turnos-public').getPublicUrl(path).data.publicUrl
}
