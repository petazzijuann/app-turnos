/** APP DEL DUEÑO · Turno cargado a mano (al tocar un hueco de la agenda). */
import { useMemo, useState } from 'react'
import { manageUrl } from '../../saas/config'
import { Banner, Button, Field, Modal, Select, TextInput, useToast } from '../../saas/ui'
import { atZone, hhmm, longDay } from '../../shared/time'
import { COUNTRIES, DEFAULT_COUNTRY, toE164, waLink } from '../../shared/phone'
import { renderTemplate, templateFor } from '../../shared/whatsapp'
import type { AppointmentFull, Business, Service, Staff } from '../../shared/types'
import { createAppointment, dbMessage, upsertClient } from '../data'
import { staffForService } from '../shop'

export function NewAppointment({
  business,
  staff,
  services,
  staffServices,
  date,
  time,
  staffId,
  onClose,
  onCreated,
}: {
  business: Business
  staff: Staff[]
  services: Service[]
  staffServices: Record<string, string[]>
  /** 'YYYY-MM-DD' en hora del negocio. */
  date: string
  /** 'HH:MM' en hora del negocio. */
  time: string
  staffId: string
  onClose: () => void
  onCreated: (a: AppointmentFull) => void
}) {
  const toast = useToast()
  const tz = business.timezone
  const activos = services.filter((s) => s.active)
  const [serviceId, setServiceId] = useState(activos[0]?.id ?? '')
  const [withStaff, setWithStaff] = useState(staffId)
  const [name, setName] = useState('')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [startTime, setStartTime] = useState(time)
  const [startDate, setStartDate] = useState(date)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const service = activos.find((s) => s.id === serviceId) ?? null
  const posibles = useMemo(
    () => staffForService(staff, staffServices, serviceId || null),
    [staff, staffServices, serviceId]
  )

  async function guardar() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!name.trim()) throw new Error('Falta el nombre del cliente.')
      const e164 = toE164(phone, country)
      if (!e164) throw new Error('Revisá el teléfono: lo necesitamos para avisarle por WhatsApp.')
      if (!service) throw new Error('Elegí un servicio.')

      const client = await upsertClient(business.id, {
        name: name.trim(),
        phone: e164,
        email: email.trim().toLowerCase() || null,
      })
      const start = atZone(startDate, startTime, tz)
      const end = new Date(start.getTime() + service.duration_min * 60000)
      const appt = await createAppointment({
        business_id: business.id,
        staff_id: withStaff,
        service_id: service.id,
        client_id: client.id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'confirmed',
        source: 'manual',
        price: service.price,
        notes: notes.trim() || null,
      })
      onCreated(appt)
      toast('Turno agendado.')

      // Atajo: mandarle la confirmación por WhatsApp ahora mismo.
      const texto = renderTemplate(templateFor(business.wa_templates, 'confirm'), {
        nombre: client.name.split(' ')[0] ?? '',
        servicio: service.name,
        dia: longDay(start, tz),
        hora: hhmm(start, tz),
        persona: posibles.find((p) => p.id === withStaff)?.name ?? '',
        negocio: business.name,
        link: manageUrl(appt.manage_token),
      })
      window.open(waLink(e164, texto), '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : dbMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Nuevo turno">
      {error ? (
        <Banner tone="danger" className="mb-3">
          {error}
        </Banner>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="fl-input flex-1"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Fecha"
          />
          <input
            type="time"
            className="fl-input w-32"
            step={300}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-label="Hora"
          />
        </div>

        <Select
          label="Servicio"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          hint={service ? `${service.duration_min} min` : undefined}
        >
          {activos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.duration_min} min
              {s.price != null ? ` · $${s.price}` : ''}
            </option>
          ))}
        </Select>

        <Select label="Con" value={withStaff} onChange={(e) => setWithStaff(e.target.value)}>
          {posibles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <TextInput
          label="Cliente"
          placeholder="Nombre y apellido"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Field label="Teléfono">
          <div className="flex gap-2">
            <select
              className="fl-input w-28 shrink-0 appearance-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label="País"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} +{c.dial}
                </option>
              ))}
            </select>
            <input
              className="fl-input"
              inputMode="tel"
              placeholder="11 2345 6789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </Field>

        <TextInput
          label="Email (opcional)"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field label="Nota (opcional)">
          <textarea
            className="fl-input min-h-16"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => void guardar()}
        >
          {busy ? 'Guardando…' : 'Agendar y avisar por WhatsApp'}
        </Button>
        <p className="text-xs text-muted">
          Se abre WhatsApp con el mensaje escrito. Si no querés avisar, cerrá la pestaña: el turno
          ya quedó agendado.
        </p>
      </div>
    </Modal>
  )
}
