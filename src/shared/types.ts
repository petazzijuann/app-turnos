/** COMPARTIDO · Formas de los datos que viajan entre la app, la base y la API. */

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
export type AppointmentSource = 'online' | 'manual'

export type Business = {
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
  wa_templates: WaTemplates
  active: boolean
  created_at: string
  updated_at: string
}

export type WaTemplates = {
  reminder?: string
  confirm?: string
  today?: string
  winback?: string
}

export type Staff = {
  id: string
  business_id: string
  name: string
  photo_url: string | null
  active: boolean
  sort_order: number
}

export type Service = {
  id: string
  business_id: string
  name: string
  duration_min: number
  price: number | null
  description: string | null
  active: boolean
  sort_order: number
}

export type HourRow = {
  id: string
  business_id: string
  staff_id: string
  weekday: number
  start_time: string
  end_time: string
}

export type TimeOff = {
  id: string
  business_id: string
  staff_id: string | null
  starts_at: string
  ends_at: string
  reason: string | null
}

export type Client = {
  id: string
  business_id: string
  name: string
  phone: string
  email: string | null
  notes: string | null
  created_at: string
}

export type Appointment = {
  id: string
  business_id: string
  staff_id: string
  service_id: string | null
  client_id: string | null
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  source: AppointmentSource
  notes: string | null
  price: number | null
  manage_token: string
  reminded_at: string | null
  created_at: string
  updated_at: string
}

/** Turno con los nombres resueltos (lo que se muestra en la agenda). */
export type AppointmentFull = Appointment & {
  staff?: Pick<Staff, 'id' | 'name'> | null
  service?: Pick<Service, 'id' | 'name' | 'duration_min' | 'price'> | null
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'notes'> | null
}

/* ----------------------- Respuestas de la API pública ---------------------- */

export type PublicBusiness = {
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
  cancel_window_hours: number
  /** false = la suscripción no está activa: no se toman reservas. */
  accepting: boolean
  services: { id: string; name: string; duration_min: number; price: number | null; description: string | null }[]
  staff: { id: string; name: string; photo_url: string | null; service_ids: string[] }[]
}

export type PublicSlotsResponse = {
  timezone: string
  date: string
  slots: { start: string; end: string; staffIds: string[] }[]
  /** Próximos días con al menos un horario libre. */
  days: { date: string; count: number }[]
}

export type BookRequest = {
  service_id: string
  staff_id: string | null
  start: string
  name: string
  phone: string
  email?: string
  notes?: string
  turnstile_token: string
}

export type BookResponse = {
  ok: true
  token: string
  appointment: {
    start: string
    end: string
    service: string
    staff: string
    business: string
    address: string | null
    timezone: string
  }
}

export type ManageResponse = {
  status: AppointmentStatus
  start: string
  end: string
  service: string
  staff: string
  client: string
  business: { name: string; slug: string; address: string | null; whatsapp: string | null; timezone: string }
  /** true si todavía está a tiempo de cancelar. */
  can_cancel: boolean
  cancel_window_hours: number
}

export type ApiError = { error: string; code?: string; slots?: { start: string; end: string }[] }
