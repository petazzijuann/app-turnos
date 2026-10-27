/** APP DEL DUEÑO · Ficha de un turno: estado, reprogramar, notas, contacto. */
import { useState } from 'react'
import { manageUrl } from '../../saas/config'
import { Banner, Button, Modal, Select, useToast, cx } from '../../saas/ui'
import { atZone, dayKey, hhmm, longDayTime } from '../../shared/time'
import { formatPhone, waLink } from '../../shared/phone'
import { templateFor, renderTemplate } from '../../shared/whatsapp'
import type { AppointmentFull, AppointmentStatus, Business, Staff } from '../../shared/types'
import { dbMessage, deleteAppointment, updateAppointment } from '../data'
import { useGuard } from '../guards'

const ESTADOS: { value: AppointmentStatus; label: string; tone: string }[] = [
  { value: 'confirmed', label: 'Confirmado', tone: 'bg-brand-soft text-brand' },
  { value: 'pending', label: 'A confirmar', tone: 'bg-warn-soft text-warn' },
  { value: 'completed', label: 'Asistió', tone: 'bg-ok-soft text-ok' },
  { value: 'no_show', label: 'No vino', tone: 'bg-danger-soft text-danger' },
  { value: 'cancelled', label: 'Cancelado', tone: 'bg-surface-2 text-muted' },
]

export const statusLabel = (s: AppointmentStatus) =>
  ESTADOS.find((e) => e.value === s)?.label ?? s
export const statusTone = (s: AppointmentStatus) =>
  ESTADOS.find((e) => e.value === s)?.tone ?? 'bg-surface-2 text-muted'

export function AppointmentSheet({
  appt,
  business,
  staff,
  onClose,
  onChanged,
}: {
  appt: AppointmentFull
  business: Business
  staff: Staff[]
  onClose: () => void
  onChanged: (a: AppointmentFull | null) => void
}) {
  const toast = useToast()
  const guard = useGuard()
  const tz = business.timezone
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(appt.notes ?? '')
  const [moving, setMoving] = useState(false)
  const [date, setDate] = useState(dayKey(appt.starts_at, tz))
  const [time, setTime] = useState(hhmm(appt.starts_at, tz))
  const [staffId, setStaffId] = useState(appt.staff_id)

  const duracion = Math.round(
    (new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60000
  )

  async function run(fn: () => Promise<AppointmentFull | null>) {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      onChanged(r)
      return true
    } catch (e) {
      setError(dbMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (status: AppointmentStatus) =>
    guard(async () => {
      const ok = await run(() => updateAppointment(appt.id, { status }))
      if (ok) {
        toast(`Turno marcado como "${statusLabel(status)}".`)
        if (status !== 'confirmed' && status !== 'pending') onClose()
      }
    })

  const guardarNotas = () =>
    guard(async () => {
      const ok = await run(() => updateAppointment(appt.id, { notes: notes.trim() || null }))
      if (ok) toast('Nota guardada.')
    })

  const reprogramar = () =>
    guard(async () => {
      const start = atZone(date, time, tz)
      const end = new Date(start.getTime() + duracion * 60000)
      const ok = await run(() =>
        updateAppointment(appt.id, {
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          staff_id: staffId,
        })
      )
      if (ok) {
        toast('Turno reprogramado.')
        setMoving(false)
      }
    })

  const borrar = () =>
    guard(async () => {
      if (!confirm('¿Borrar este turno de la agenda? No se puede deshacer.')) return
      await run(async () => {
        await deleteAppointment(appt.id)
        return null
      })
      onClose()
    })

  const wa = appt.client?.phone
    ? waLink(
        appt.client.phone,
        renderTemplate(templateFor(business.wa_templates, 'confirm'), {
          nombre: appt.client.name.split(' ')[0] ?? '',
          servicio: appt.service?.name ?? 'tu turno',
          dia: longDayTime(appt.starts_at, tz).split(',')[0] ?? '',
          hora: hhmm(appt.starts_at, tz),
          persona: appt.staff?.name ?? '',
          negocio: business.name,
          link: manageUrl(appt.manage_token),
        })
      )
    : null

  return (
    <Modal open onClose={onClose} title={appt.client?.name ?? 'Turno'}>
      {error ? (
        <Banner tone="danger" className="mb-3">
          {error}
        </Banner>
      ) : null}

      <div className="space-y-1">
        <p className="font-display text-lg font-semibold">
          {longDayTime(appt.starts_at, tz)} – {hhmm(appt.ends_at, tz)}
        </p>
        <p className="text-muted">
          {appt.service?.name ?? 'Turno'} · {duracion} min
          {appt.service?.price != null ? ` · $${appt.service.price}` : ''}
        </p>
        <p className="text-muted">Con {appt.staff?.name ?? '—'}</p>
        <p className="flex flex-wrap items-center gap-2 pt-1">
          <span
            className={cx(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              statusTone(appt.status)
            )}
          >
            {statusLabel(appt.status)}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
            {appt.source === 'online' ? 'Reserva online' : 'Cargado a mano'}
          </span>
          {appt.reminded_at ? (
            <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs text-ok">
              Recordado
            </span>
          ) : null}
        </p>
      </div>

      {appt.client?.phone ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`tel:${appt.client.phone}`}
            className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium no-underline hover:bg-surface-2"
          >
            📞 Llamar
          </a>
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center rounded-xl border border-transparent bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand no-underline hover:bg-brand-strong"
            >
              💬 WhatsApp
            </a>
          ) : null}
          <span className="self-center text-xs text-muted">
            {formatPhone(appt.client.phone)}
          </span>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="fl-label">Marcar como</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => setStatus('completed')}>
            ✅ Asistió
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setStatus('no_show')}>
            🚫 No vino
          </Button>
          {appt.status === 'pending' ? (
            <Button size="sm" disabled={busy} onClick={() => setStatus('confirmed')}>
              Confirmar
            </Button>
          ) : null}
          {appt.status !== 'cancelled' ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setStatus('cancelled')}>
              Cancelar turno
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        {moving ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <p className="fl-label mb-0">Nueva fecha y hora</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                className="fl-input flex-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Fecha"
              />
              <input
                type="time"
                className="fl-input w-32"
                value={time}
                step={300}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Hora"
              />
            </div>
            <Select label="Con" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy} onClick={reprogramar}>
                Guardar cambio
              </Button>
              <Button variant="ghost" onClick={() => setMoving(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setMoving(true)}>🕑 Reprogramar</Button>
        )}
      </div>

      <div className="mt-5">
        <label className="fl-label" htmlFor="appt-notes">
          Notas
        </label>
        <textarea
          id="appt-notes"
          className="fl-input min-h-20"
          placeholder="Cómo le gusta el corte, qué producto usa, lo que sea."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button size="sm" disabled={busy || notes === (appt.notes ?? '')} onClick={guardarNotas}>
            Guardar nota
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={borrar}>
            Borrar turno
          </Button>
        </div>
      </div>
    </Modal>
  )
}
