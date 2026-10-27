/**
 * APP DEL DUEÑO · Recordatorios por WhatsApp (la función estrella).
 * Acá vive la lógica de "a quién le falta el recordatorio" y el armado del
 * mensaje; la pantalla solo muestra la lista y abre wa.me.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { manageUrl } from '../saas/config'
import { renderTemplate, templateFor, type TemplateKind } from '../shared/whatsapp'
import { dayRange, hhmm, longDay, todayKey, addDaysKey } from '../shared/time'
import { waLink } from '../shared/phone'
import type { AppointmentFull, Business } from '../shared/types'
import { loadAppointments, loadMyBusiness } from './data'

/**
 * Turnos que todavía valen la pena recordar (no cancelados ni pasados),
 * en orden de horario: así el dueño los va despachando de arriba hacia abajo.
 */
export function pendingFor(appts: AppointmentFull[], now = new Date()): AppointmentFull[] {
  return appts
    .filter(
      (a) =>
        (a.status === 'confirmed' || a.status === 'pending') &&
        !a.reminded_at &&
        !!a.client?.phone &&
        new Date(a.ends_at).getTime() > now.getTime()
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

/** Mensaje final para un turno, con las variables ya reemplazadas. */
export function reminderText(
  business: Business,
  appt: AppointmentFull,
  kind: TemplateKind = 'reminder'
): string {
  const tz = business.timezone
  return renderTemplate(templateFor(business.wa_templates, kind), {
    nombre: appt.client?.name?.split(' ')[0] ?? '',
    servicio: appt.service?.name ?? 'tu turno',
    dia: longDay(appt.starts_at, tz),
    hora: hhmm(appt.starts_at, tz),
    persona: appt.staff?.name ?? '',
    negocio: business.name,
    link: manageUrl(appt.manage_token),
  })
}

/** Link de WhatsApp listo para abrir. */
export function reminderLink(
  business: Business,
  appt: AppointmentFull,
  kind: TemplateKind = 'reminder'
): string | null {
  const phone = appt.client?.phone
  if (!phone) return null
  return waLink(phone, reminderText(business, appt, kind))
}

/**
 * Contador para el globito de la navegación: cuántos turnos de mañana (y de
 * hoy) están sin recordar. Se recalcula al volver a la app.
 */
export function usePendingReminders() {
  const [count, setCount] = useState(0)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const business = await loadMyBusiness()
      if (!business) return
      const tz = business.timezone
      const hoy = todayKey(tz)
      const { from } = dayRange(hoy, tz)
      const { to } = dayRange(addDaysKey(hoy, 1), tz)
      const appts = await loadAppointments(business.id, from, to)
      if (alive.current) setCount(pendingFor(appts).length)
    } catch {
      /* si falla, el globito simplemente no se muestra */
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { count, refresh }
}
