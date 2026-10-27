/**
 * COMPARTIDO · Cálculo de disponibilidad.
 * ---------------------------------------------------------------------------
 * Funciones puras (sin red, sin Supabase, sin DOM) para que las use tanto el
 * front como las Pages Functions, y para poder testearlas de verdad.
 *
 * Reglas, en orden:
 *   horario semanal de la persona
 *   − bloqueos (vacaciones, feriados, del negocio o de la persona)
 *   − turnos ya tomados (los cancelados no ocupan)
 *   − anticipación mínima
 *   y la duración del servicio tiene que entrar COMPLETA dentro del bloque.
 *
 * Todo lo que sale es ISO en UTC: la zona horaria del negocio solo se usa para
 * convertir "el martes de 9 a 13" en instantes reales (y así el horario de
 * verano no corre los turnos).
 */
import { fromZonedTime } from 'date-fns-tz'

/** Bloque de horario semanal. weekday: 0 = domingo … 6 = sábado. */
export type HourBlock = {
  weekday: number
  /** 'HH:MM' o 'HH:MM:SS' en hora del negocio. */
  start: string
  end: string
}

/** Rango de tiempo real (ISO con zona, o Date). */
export type Busy = { start: string | Date; end: string | Date }

export type StaffAvailability = {
  staffId: string
  /** Horario semanal de esta persona. */
  hours: HourBlock[]
  /** Turnos tomados + bloqueos que le aplican. */
  busy: Busy[]
}

export type SlotsInput = {
  /** Día a calcular, 'YYYY-MM-DD', en hora del negocio. */
  date: string
  /** Zona horaria del negocio, ej. 'America/Argentina/Buenos_Aires'. */
  timezone: string
  /** Duración del servicio en minutos. */
  durationMin: number
  /** Cada cuántos minutos se ofrece un horario. */
  stepMin: number
  /** Horas de anticipación mínima para reservar. */
  minNoticeHours?: number
  /** "Ahora" (inyectable para los tests). */
  now?: string | Date
  /** Personas candidatas (ya filtradas por "hace este servicio"). */
  staff: StaffAvailability[]
}

export type Slot = {
  /** Inicio en ISO UTC. */
  start: string
  /** Fin en ISO UTC. */
  end: string
  /** Quiénes están libres a esa hora (para "Cualquiera"). */
  staffIds: string[]
}

const MIN = 60_000

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime())

/** 'HH:MM[:SS]' -> minutos desde la medianoche. */
export function parseHm(hm: string): number {
  const [h = '0', m = '0'] = hm.split(':')
  return Number(h) * 60 + Number(m)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutos desde la medianoche -> 'HH:MM'. */
export function formatHm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * Día de la semana de una fecha civil 'YYYY-MM-DD'.
 * No depende de la zona: una fecha del calendario cae el mismo día en todas.
 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

/**
 * 'YYYY-MM-DD' + 'HH:MM' en la zona del negocio -> instante real.
 * Si la hora no existe por el cambio de horario de verano, date-fns-tz la
 * resuelve al instante equivalente más cercano; como el fin del bloque se
 * convierte igual, el bloque mantiene su duración real.
 */
export function zonedInstant(date: string, hm: string, timezone: string): Date {
  const [h, m] = hm.split(':')
  return fromZonedTime(`${date}T${pad(Number(h))}:${pad(Number(m ?? 0))}:00`, timezone)
}

/** Suma minutos a una fecha civil ('YYYY-MM-DD' -> 'YYYY-MM-DD'). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd

/**
 * Bloques de trabajo reales de una persona para un día, ya convertidos a
 * instantes. Un bloque que cruza la medianoche (ej. 20:00 a 02:00) no está
 * soportado a propósito: se parte en dos filas de horario.
 */
export function workBlocks(
  staff: StaffAvailability,
  date: string,
  timezone: string
): { start: number; end: number }[] {
  const wd = weekdayOf(date)
  return staff.hours
    .filter((b) => b.weekday === wd && parseHm(b.end) > parseHm(b.start))
    .map((b) => ({
      start: zonedInstant(date, b.start, timezone).getTime(),
      end: zonedInstant(date, b.end, timezone).getTime(),
    }))
    .sort((a, b) => a.start - b.start)
}

/**
 * Horarios disponibles de un día, agrupados por hora de inicio.
 * Devuelve las horas ordenadas, y en cada una quiénes pueden atender.
 */
export function computeSlots(input: SlotsInput): Slot[] {
  const {
    date,
    timezone,
    durationMin,
    stepMin,
    minNoticeHours = 0,
    now = new Date(),
    staff,
  } = input

  if (!(durationMin > 0) || !(stepMin > 0) || staff.length === 0) return []

  const earliest = ms(now) + minNoticeHours * 60 * MIN
  const duration = durationMin * MIN
  const step = stepMin * MIN

  /** start (epoch) -> personas libres */
  const byStart = new Map<number, string[]>()

  for (const person of staff) {
    const busy = person.busy
      .map((b) => ({ start: ms(b.start), end: ms(b.end) }))
      .filter((b) => b.end > b.start)

    for (const block of workBlocks(person, date, timezone)) {
      // La duración tiene que entrar completa: el último inicio posible es
      // fin del bloque − duración.
      for (let t = block.start; t + duration <= block.end; t += step) {
        if (t < earliest) continue
        const end = t + duration
        if (busy.some((b) => overlaps(t, end, b.start, b.end))) continue
        const list = byStart.get(t)
        if (list) list.push(person.staffId)
        else byStart.set(t, [person.staffId])
      }
    }
  }

  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, staffIds]) => ({
      start: new Date(start).toISOString(),
      end: new Date(start + duration).toISOString(),
      staffIds,
    }))
}

/** Días (civiles) que tienen al menos un horario libre. */
export function daysWithSlots(
  base: Omit<SlotsInput, 'date'>,
  from: string,
  days: number
): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    out.push({ date, count: computeSlots({ ...base, date }).length })
  }
  return out
}

/**
 * A quién le toca cuando el cliente elige "Cualquiera": la persona con menos
 * turnos ese día, y a igualdad, la de orden más bajo. Así se reparte el
 * trabajo en lugar de cargar siempre al primero de la lista.
 */
export function pickStaff(
  candidates: string[],
  load: Record<string, number> = {},
  order: string[] = []
): string | null {
  if (candidates.length === 0) return null
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  return [...candidates].sort(
    (a, b) => (load[a] ?? 0) - (load[b] ?? 0) || rank(a) - rank(b) || a.localeCompare(b)
  )[0]!
}

/**
 * ¿Hay un hueco libre justo en esta hora para esta persona?
 * Lo usa el servidor para recalcular antes de insertar (defensa además de la
 * restricción EXCLUDE de la base).
 */
export function isSlotFree(input: SlotsInput, startISO: string, staffId: string): boolean {
  const target = new Date(startISO).getTime()
  return computeSlots(input).some(
    (s) => new Date(s.start).getTime() === target && s.staffIds.includes(staffId)
  )
}
