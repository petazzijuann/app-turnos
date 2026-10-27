/** COMPARTIDO · Archivo .ics para "Agregar a mi calendario". */

const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha en el formato de iCalendar, siempre en UTC (20260310T153000Z). */
export function icsStamp(when: string | Date): string {
  const d = when instanceof Date ? when : new Date(when)
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Las líneas del .ics no pueden pasar de 75 octetos. */
function fold(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = []
  let rest = line
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73))
    rest = rest.slice(73)
  }
  parts.push(rest)
  return parts.join('\r\n ')
}

export type IcsEvent = {
  uid: string
  start: string | Date
  end: string | Date
  title: string
  description?: string
  location?: string
  url?: string
  organizerEmail?: string
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Futurislabs//Turnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(e.start)}`,
    `DTEND:${icsStamp(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : null,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    e.url ? `URL:${escapeText(e.url)}` : null,
    e.organizerEmail ? `ORGANIZER:mailto:${e.organizerEmail}` : null,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de tu turno',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)

  return lines.map(fold).join('\r\n') + '\r\n'
}

/** data: URL para descargar el .ics sin pedirle nada al servidor. */
export const icsDataUrl = (ics: string) =>
  'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
