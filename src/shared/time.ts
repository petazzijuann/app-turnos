/**
 * COMPARTIDO · Fechas en la zona horaria del negocio.
 * Todo se guarda como timestamptz (UTC); acá se traduce para mostrar.
 */
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { addDays } from './slots'

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

const d = (v: string | Date) => (v instanceof Date ? v : new Date(v))

/** 'martes 10 de marzo' -> 'Martes 10 de marzo' (el locale es los da en minúscula). */
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** 'YYYY-MM-DD' del día (en hora del negocio) al que pertenece un instante. */
export const dayKey = (when: string | Date, tz: string) =>
  formatInTimeZone(d(when), tz, 'yyyy-MM-dd')

/** 'HH:mm' en hora del negocio. */
export const hhmm = (when: string | Date, tz: string) => formatInTimeZone(d(when), tz, 'HH:mm')

/** 'Martes 10 de marzo' */
export const longDay = (when: string | Date, tz: string) =>
  upperFirst(formatInTimeZone(d(when), tz, "EEEE d 'de' MMMM", { locale: es }))

/** 'Mar 10/03' */
export const shortDay = (when: string | Date, tz: string) =>
  upperFirst(formatInTimeZone(d(when), tz, 'EEE dd/MM', { locale: es }))

/** 'Martes 10 de marzo, 15:30' */
export const longDayTime = (when: string | Date, tz: string) =>
  `${longDay(when, tz)}, ${hhmm(when, tz)}`

/** Hoy, en hora del negocio, como 'YYYY-MM-DD'. */
export const todayKey = (tz: string, now: Date = new Date()) => dayKey(now, tz)

/** Instante de 'YYYY-MM-DD' + 'HH:mm' interpretados en hora del negocio. */
export const atZone = (date: string, time: string, tz: string) =>
  fromZonedTime(`${date}T${time.length === 5 ? time + ':00' : time}`, tz)

/** Principio y fin (exclusivo) de un día del negocio, en instantes reales. */
export function dayRange(date: string, tz: string): { from: Date; to: Date } {
  const from = atZone(date, '00:00', tz)
  // +26h y después recorte al día siguiente: así el cambio de hora no muerde.
  const next = addDays(date, 1)
  return { from, to: atZone(next, '00:00', tz) }
}

/** Suma días a una fecha civil 'YYYY-MM-DD'. */
export const addDaysKey = addDays

/** Lunes de la semana de una fecha civil (la semana arranca el lunes). */
export function weekStart(date: string): string {
  const [y, m, dd] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y!, (m ?? 1) - 1, dd ?? 1)).getUTCDay() // 0 = domingo
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

/** Minutos desde la medianoche del negocio (para ubicar un turno en la grilla). */
export function minutesOfDay(when: string | Date, tz: string): number {
  const z = toZonedTime(d(when), tz)
  return z.getHours() * 60 + z.getMinutes()
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Zonas horarias habituales de los negocios de la región. */
export const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'America/Argentina/Salta',
  'America/Argentina/Ushuaia',
  'America/Montevideo',
  'America/Santiago',
  'America/Asuncion',
  'America/La_Paz',
  'America/Sao_Paulo',
  'America/Lima',
  'America/Bogota',
  'America/Mexico_City',
  'Europe/Madrid',
]
