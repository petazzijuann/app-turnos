/** COMPARTIDO · Teléfonos: selector de país y normalización para wa.me. */

export type Country = { code: string; name: string; dial: string; flag: string; example: string }

/** Países de la región + los habituales. Argentina primero (es el default). */
export const COUNTRIES: Country[] = [
  { code: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷', example: '11 2345 6789' },
  { code: 'UY', name: 'Uruguay', dial: '598', flag: '🇺🇾', example: '99 123 456' },
  { code: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱', example: '9 1234 5678' },
  { code: 'PY', name: 'Paraguay', dial: '595', flag: '🇵🇾', example: '981 123456' },
  { code: 'BO', name: 'Bolivia', dial: '591', flag: '🇧🇴', example: '712 34567' },
  { code: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷', example: '11 91234 5678' },
  { code: 'PE', name: 'Perú', dial: '51', flag: '🇵🇪', example: '912 345 678' },
  { code: 'CO', name: 'Colombia', dial: '57', flag: '🇨🇴', example: '301 234 5678' },
  { code: 'EC', name: 'Ecuador', dial: '593', flag: '🇪🇨', example: '99 123 4567' },
  { code: 'MX', name: 'México', dial: '52', flag: '🇲🇽', example: '55 1234 5678' },
  { code: 'ES', name: 'España', dial: '34', flag: '🇪🇸', example: '612 345 678' },
  { code: 'US', name: 'Estados Unidos', dial: '1', flag: '🇺🇸', example: '305 123 4567' },
]

export const DEFAULT_COUNTRY = 'AR'

export const countryByCode = (code: string) =>
  COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]!

const digits = (s: string) => s.replace(/\D+/g, '')

/**
 * Arma el teléfono en formato internacional (+54911...).
 * Argentina: se saca el 0 de larga distancia y el 15 del celular, y se agrega
 * el 9 que WhatsApp necesita. Es el error más común al cargar un contacto.
 */
export function toE164(local: string, countryCode = DEFAULT_COUNTRY): string | null {
  const country = countryByCode(countryCode)
  let n = digits(local)
  if (!n) return null

  // Si ya vino con el código de país, lo respetamos.
  if (n.startsWith(country.dial) && n.length > country.dial.length + 5) {
    n = n.slice(country.dial.length)
  }

  if (country.code === 'AR') {
    if (n.startsWith('0')) n = n.slice(1)
    // 11 15 1234 5678 -> el 15 va después del código de área (2 a 4 dígitos).
    n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
    if (!n.startsWith('9')) n = '9' + n
  }

  const full = country.dial + n
  if (full.length < 8 || full.length > 15) return null
  return '+' + full
}

/** Número tal como lo quiere wa.me: solo dígitos, sin +. */
export const toWaNumber = (e164: string) => digits(e164)

/** Link de WhatsApp con el mensaje ya escrito. */
export function waLink(phone: string, text?: string): string {
  const n = toWaNumber(phone)
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${n}${q}`
}

/** Para mostrar: +54 9 11 2345-6789 queda legible sin pelearse con cada país. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const n = digits(e164)
  if (n.length < 8) return e164
  const country = COUNTRIES.find((c) => n.startsWith(c.dial))
  if (!country) return '+' + n
  const rest = n.slice(country.dial.length)
  // Agrupado genérico: los últimos 4, los 4 anteriores y el resto adelante.
  const tail = rest.slice(-4)
  const mid = rest.slice(-8, -4)
  const head = rest.slice(0, Math.max(0, rest.length - 8))
  return `+${country.dial} ${head} ${mid}-${tail}`.replace(/\s+/g, ' ').replace(' -', ' ').trim()
}
