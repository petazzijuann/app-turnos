/**
 * APP DEL DUEÑO · Configuración: negocio, reglas, personas, servicios,
 * horarios, bloqueos, mensajes de WhatsApp y el link con el QR.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, Button, Card, Field, NumberInput, Select, TextInput, useToast, cx } from '../saas/ui'
import { DEFAULT_TZ, TIMEZONES, addDaysKey, atZone, dayKey, longDayTime } from '../shared/time'
import { COUNTRIES, DEFAULT_COUNTRY, toE164 } from '../shared/phone'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  WA_VARS,
  WA_VAR_HELP,
  templateFor,
  type TemplateKind,
} from '../shared/whatsapp'
import type { Service, Staff, TimeOff } from '../shared/types'
import { CATEGORIES, SERVICE_TEMPLATES, slugify, type CategoryKey } from './catalog'
import {
  createService,
  createStaff,
  createTimeOff,
  dbMessage,
  deleteService,
  deleteStaff,
  deleteTimeOff,
  loadTimeOff,
  replaceHours,
  setStaffServices,
  slugAvailable,
  updateBusiness,
  updateService,
  updateStaff,
  uploadImage,
} from './data'
import { useShop } from './shop'
import { useGuard } from './guards'
import { SOUND_KEY } from './shop'
import { ShareBooking } from './components/ShareBooking'
import { WeekEditor } from './Onboarding'

type Section = 'negocio' | 'reglas' | 'personas' | 'servicios' | 'horarios' | 'bloqueos' | 'mensajes' | 'link'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'negocio', label: 'Negocio' },
  { key: 'reglas', label: 'Reglas' },
  { key: 'personas', label: 'Personas' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'horarios', label: 'Horarios' },
  { key: 'bloqueos', label: 'Bloqueos' },
  { key: 'mensajes', label: 'Mensajes' },
  { key: 'link', label: 'Link y QR' },
]

export function Settings() {
  const [section, setSection] = useState<Section>('negocio')
  const { business } = useShop()
  const biz = business!

  return (
    <div className="space-y-3">
      <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Configuración">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            aria-current={section === s.key}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm',
              section === s.key
                ? 'border-brand bg-brand-soft font-semibold text-brand'
                : 'border-line bg-surface text-muted'
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'negocio' ? <BusinessForm /> : null}
      {section === 'reglas' ? <RulesForm /> : null}
      {section === 'personas' ? <StaffSection /> : null}
      {section === 'servicios' ? <ServicesSection /> : null}
      {section === 'horarios' ? <HoursSection /> : null}
      {section === 'bloqueos' ? <TimeOffSection /> : null}
      {section === 'mensajes' ? <TemplatesSection /> : null}
      {section === 'link' ? <ShareBooking slug={biz.slug} name={biz.name} /> : null}
    </div>
  )
}

/* -------------------------------- Negocio -------------------------------- */

function BusinessForm() {
  const { business, setBusiness } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const [name, setName] = useState(biz.name)
  const [category, setCategory] = useState<CategoryKey>(biz.category as CategoryKey)
  const [slug, setSlug] = useState(biz.slug)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'bad'>('idle')
  const [address, setAddress] = useState(biz.address ?? '')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [whatsapp, setWhatsapp] = useState(biz.whatsapp ?? '')
  const [timezone, setTimezone] = useState(biz.timezone || DEFAULT_TZ)
  const [welcome, setWelcome] = useState(biz.welcome_message ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const clean = slug.trim().toLowerCase()
    if (clean === biz.slug) return setSlugState('idle')
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(clean)) return setSlugState('bad')
    setSlugState('checking')
    const t = setTimeout(async () => {
      setSlugState((await slugAvailable(clean, biz.id)) ? 'free' : 'taken')
    }, 450)
    return () => clearTimeout(t)
  }, [slug, biz.slug, biz.id])

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      setError(null)
      try {
        if (slugState === 'taken' || slugState === 'bad')
          throw new Error('Revisá el link de reservas.')
        const wa = whatsapp.startsWith('+') ? whatsapp : toE164(whatsapp, country)
        if (!wa) throw new Error('Revisá el WhatsApp.')
        setBusiness(
          await updateBusiness(biz.id, {
            name: name.trim(),
            category,
            slug: slug.trim().toLowerCase(),
            address: address.trim() || null,
            whatsapp: wa,
            timezone,
            welcome_message: welcome.trim() || null,
          })
        )
        toast('Datos guardados.')
      } catch (e) {
        setError(e instanceof Error ? e.message : dbMessage(e))
      } finally {
        setBusy(false)
      }
    })

  const subirLogo = (file: File) =>
    guard(async () => {
      try {
        const url = await uploadImage(biz.id, file, 'logo')
        setBusiness(await updateBusiness(biz.id, { logo_url: url }))
        toast('Logo actualizado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <Card title="Datos del negocio">
      {error ? (
        <Banner tone="danger" className="mb-3">
          {error}
        </Banner>
      ) : null}
      <div className="space-y-4">
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />

        <Select
          label="Rubro"
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryKey)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {c.label}
            </option>
          ))}
        </Select>

        <Field
          label="Link de reservas"
          hint={
            slugState === 'taken'
              ? '❌ Ese link ya está usado.'
              : slugState === 'bad'
                ? 'Solo letras, números y guiones.'
                : slugState === 'free'
                  ? '✅ Disponible.'
                  : 'Si lo cambiás, el link viejo deja de funcionar.'
          }
        >
          <input
            className="fl-input"
            value={slug}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>

        <Field label="WhatsApp del negocio">
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
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
        </Field>

        <TextInput
          label="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          hint="Se muestra con link a Google Maps."
        />

        <Select label="Zona horaria" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>

        <Field label="Mensaje de bienvenida" hint="Se ve en tu página de reservas.">
          <textarea
            className="fl-input min-h-20"
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            placeholder="¡Gracias por reservar! Si no podés venir, avisanos con tiempo."
          />
        </Field>

        <Field label="Logo" hint="Imagen cuadrada, hasta 2 MB.">
          <div className="flex items-center gap-3">
            {biz.logo_url ? (
              <img
                src={biz.logo_url}
                alt=""
                className="size-12 rounded-xl border border-line object-cover"
              />
            ) : null}
            <input
              type="file"
              accept="image/*"
              className="fl-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) subirLogo(f)
              }}
            />
          </div>
        </Field>

        <SoundToggle />

        <Button variant="primary" size="lg" disabled={busy} onClick={guardar}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </Card>
  )
}

function SoundToggle() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(`fl.turnos.${SOUND_KEY}`) !== 'false'
    } catch {
      return true
    }
  })
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line p-3">
      <input
        type="checkbox"
        className="size-5 accent-[var(--fl-brand)]"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked)
          try {
            localStorage.setItem(`fl.turnos.${SOUND_KEY}`, String(e.target.checked))
          } catch {
            /* sin localStorage */
          }
        }}
      />
      <span className="min-w-0 flex-1 text-sm">
        Sonido cuando entra una reserva online
        <span className="block text-xs text-muted">
          Solo mientras tengas la app abierta en este dispositivo.
        </span>
      </span>
    </label>
  )
}

/* --------------------------------- Reglas -------------------------------- */

function RulesForm() {
  const { business, setBusiness } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const [minNotice, setMinNotice] = useState(biz.min_notice_hours)
  const [maxDays, setMaxDays] = useState(biz.max_days_ahead)
  const [step, setStep] = useState(biz.slot_step_min)
  const [cancelH, setCancelH] = useState(biz.cancel_window_hours)
  const [active, setActive] = useState(biz.active)
  const [busy, setBusy] = useState(false)

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        setBusiness(
          await updateBusiness(biz.id, {
            min_notice_hours: Math.round(minNotice),
            max_days_ahead: Math.round(maxDays),
            slot_step_min: Math.round(step),
            cancel_window_hours: Math.round(cancelH),
            active,
          })
        )
        toast('Reglas guardadas.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  return (
    <Card title="Reglas de reserva">
      <div className="space-y-4">
        <NumberInput
          label="Anticipación mínima"
          suffix="h"
          value={minNotice}
          onValue={setMinNotice}
          hint="Cuántas horas antes, como mínimo, pueden reservar. 0 = hasta el último momento."
        />
        <NumberInput
          label="Días hacia adelante"
          suffix="días"
          value={maxDays}
          onValue={setMaxDays}
          min={1}
          hint="Hasta cuándo se puede reservar."
        />
        <Select
          label="Intervalo de horarios"
          value={String(step)}
          onChange={(e) => setStep(Number(e.target.value))}
          hint="Cada cuánto se ofrecen horarios (10:00, 10:15, 10:30…)."
        >
          {[5, 10, 15, 20, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutos
            </option>
          ))}
        </Select>
        <NumberInput
          label="Cancelación hasta"
          suffix="h antes"
          value={cancelH}
          onValue={setCancelH}
          hint="Después de ese límite, el cliente ya no puede cancelar solo."
        />
        <label className="flex items-center gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            className="size-5 accent-[var(--fl-brand)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="min-w-0 flex-1 text-sm">
            Tomar reservas online
            <span className="block text-xs text-muted">
              Destildalo si querés pausar tu página de reservas sin borrar nada.
            </span>
          </span>
        </label>
        <Button variant="primary" size="lg" disabled={busy} onClick={guardar}>
          {busy ? 'Guardando…' : 'Guardar reglas'}
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------- Personas ------------------------------- */

function StaffSection() {
  const { business, staff, services, staffServices, reload } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const [nuevo, setNuevo] = useState('')

  const agregar = () =>
    guard(async () => {
      if (!nuevo.trim()) return
      try {
        await createStaff({
          business_id: biz.id,
          name: nuevo.trim(),
          sort_order: staff.length + 1,
        })
        setNuevo('')
        await reload()
        toast('Persona agregada.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <Card title="Quién atiende" subtitle="Las personas inactivas no aparecen en tu página.">
      <ul className="space-y-2">
        {staff.map((s) => (
          <StaffRow
            key={s.id}
            person={s}
            services={services}
            selected={staffServices[s.id] ?? []}
            onDone={reload}
          />
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          className="fl-input"
          placeholder="Nombre"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
        />
        <Button variant="primary" onClick={agregar}>
          Agregar
        </Button>
      </div>
    </Card>
  )
}

function StaffRow({
  person,
  services,
  selected,
  onDone,
}: {
  person: Staff
  services: Service[]
  selected: string[]
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const guard = useGuard()
  const { business } = useShop()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(person.name)
  const [sel, setSel] = useState<string[]>(selected)
  const [busy, setBusy] = useState(false)

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        await updateStaff(person.id, { name: name.trim() || person.name })
        await setStaffServices(person.id, sel)
        await onDone()
        toast('Guardado.')
        setOpen(false)
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  const subirFoto = (file: File) =>
    guard(async () => {
      try {
        const url = await uploadImage(business!.id, file, 'staff')
        await updateStaff(person.id, { photo_url: url })
        await onDone()
        toast('Foto actualizada.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        {person.photo_url ? (
          <img src={person.photo_url} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold">
            {person.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{person.name}</span>
          <span className="block text-xs text-muted">
            {person.active ? 'Activa' : 'Inactiva'} ·{' '}
            {sel.length === 0 ? 'hace todos los servicios' : `${sel.length} servicios`}
          </span>
        </span>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cerrar' : 'Editar'}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Foto (opcional)">
            <input
              type="file"
              accept="image/*"
              className="fl-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) subirFoto(f)
              }}
            />
          </Field>
          <Field label="Servicios que hace" hint="Sin tildar ninguno = hace todos.">
            <ul className="space-y-1">
              {services.map((sv) => (
                <li key={sv.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--fl-brand)]"
                      checked={sel.includes(sv.id)}
                      onChange={(e) =>
                        setSel((v) =>
                          e.target.checked ? [...v, sv.id] : v.filter((x) => x !== sv.id)
                        )
                      }
                    />
                    {sv.name}
                  </label>
                </li>
              ))}
            </ul>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={guardar}>
              Guardar
            </Button>
            <Button
              onClick={() =>
                guard(async () => {
                  await updateStaff(person.id, { active: !person.active })
                  await onDone()
                })
              }
            >
              {person.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                guard(async () => {
                  if (!confirm(`¿Borrar a ${person.name}? Se borran también sus turnos.`)) return
                  try {
                    await deleteStaff(person.id)
                    await onDone()
                  } catch (e) {
                    toast(dbMessage(e), 'danger')
                  }
                })
              }
            >
              Borrar
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/* ------------------------------- Servicios ------------------------------- */

function ServicesSection() {
  const { business, services, reload } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const sugeridos = useMemo(
    () =>
      (SERVICE_TEMPLATES[biz.category as CategoryKey] ?? SERVICE_TEMPLATES.otro).filter(
        (t) => !services.some((s) => s.name.toLowerCase() === t.name.toLowerCase())
      ),
    [biz.category, services]
  )

  const agregar = (name: string, duration_min: number) =>
    guard(async () => {
      try {
        await createService({
          business_id: biz.id,
          name,
          duration_min,
          sort_order: services.length + 1,
        })
        await reload()
        toast('Servicio agregado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <div className="space-y-3">
      <Card title="Servicios">
        <ul className="space-y-2">
          {services.map((s) => (
            <ServiceRow key={s.id} service={s} onDone={reload} />
          ))}
        </ul>
        <NewService onAdd={agregar} />
      </Card>

      {sugeridos.length > 0 ? (
        <Card title="Sugeridos para tu rubro">
          <div className="flex flex-wrap gap-2">
            {sugeridos.map((t) => (
              <Button key={t.name} size="sm" onClick={() => agregar(t.name, t.duration_min)}>
                + {t.name} ({t.duration_min}′)
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function NewService({ onAdd }: { onAdd: (name: string, duration: number) => void }) {
  const [name, setName] = useState('')
  const [dur, setDur] = useState(30)
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-32 flex-1">
        <label className="fl-label" htmlFor="nuevo-servicio">
          Nuevo servicio
        </label>
        <input
          id="nuevo-servicio"
          className="fl-input"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="w-24">
        <label className="fl-label" htmlFor="nuevo-servicio-dur">
          Min
        </label>
        <input
          id="nuevo-servicio-dur"
          className="fl-input"
          inputMode="numeric"
          value={dur}
          onChange={(e) => setDur(Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
      </div>
      <Button
        variant="primary"
        onClick={() => {
          if (!name.trim() || dur <= 0) return
          onAdd(name.trim(), dur)
          setName('')
        }}
      >
        Agregar
      </Button>
    </div>
  )
}

function ServiceRow({ service, onDone }: { service: Service; onDone: () => Promise<void> }) {
  const toast = useToast()
  const guard = useGuard()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(service.name)
  const [dur, setDur] = useState(service.duration_min)
  const [price, setPrice] = useState(service.price != null ? String(service.price) : '')
  const [desc, setDesc] = useState(service.description ?? '')
  const [busy, setBusy] = useState(false)

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        await updateService(service.id, {
          name: name.trim() || service.name,
          duration_min: Math.max(1, Math.round(dur)),
          price: price.trim() ? Number(price.replace(',', '.')) : null,
          description: desc.trim() || null,
        })
        await onDone()
        toast('Servicio guardado.')
        setOpen(false)
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{service.name}</span>
          <span className="block text-xs text-muted">
            {service.duration_min} min
            {service.price != null ? ` · $${service.price}` : ''}
            {service.active ? '' : ' · inactivo'}
          </span>
        </span>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cerrar' : 'Editar'}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Duración" suffix="min" value={dur} onValue={setDur} min={1} />
            <TextInput
              label="Precio"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <Field label="Descripción (opcional)">
            <textarea
              className="fl-input min-h-16"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={guardar}>
              Guardar
            </Button>
            <Button
              onClick={() =>
                guard(async () => {
                  await updateService(service.id, { active: !service.active })
                  await onDone()
                })
              }
            >
              {service.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                guard(async () => {
                  if (!confirm(`¿Borrar "${service.name}"?`)) return
                  try {
                    await deleteService(service.id)
                    await onDone()
                  } catch (e) {
                    toast(dbMessage(e), 'danger')
                  }
                })
              }
            >
              Borrar
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/* -------------------------------- Horarios ------------------------------- */

function HoursSection() {
  const { business, staff, hours, reload } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const activos = staff.filter((s) => s.active)
  const [who, setWho] = useState(activos[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  const week = useMemo(() => {
    const mine = hours.filter((h) => h.staff_id === who)
    return Array.from({ length: 7 }, (_, i) => i).map((weekday) => ({
      weekday,
      blocks: mine
        .filter((h) => h.weekday === weekday)
        .map((h) => [h.start_time.slice(0, 5), h.end_time.slice(0, 5)] as [string, string]),
    }))
    // El editor muestra lunes primero.
  }, [hours, who])

  const ordenada = [...week.slice(1), week[0]!]
  const [draft, setDraft] = useState(ordenada)
  useEffect(() => setDraft([...week.slice(1), week[0]!]), [week])

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        const blocks = draft.flatMap((d) =>
          d.blocks
            .filter(([a, b]) => a && b && b > a)
            .map(([start_time, end_time]) => ({ weekday: d.weekday, start_time, end_time }))
        )
        await replaceHours(biz.id, who, blocks)
        await reload()
        toast('Horario guardado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  const copiarATodos = () =>
    guard(async () => {
      if (!confirm('¿Aplicar este horario a todas las personas?')) return
      setBusy(true)
      try {
        const blocks = draft.flatMap((d) =>
          d.blocks
            .filter(([a, b]) => a && b && b > a)
            .map(([start_time, end_time]) => ({ weekday: d.weekday, start_time, end_time }))
        )
        for (const s of activos) await replaceHours(biz.id, s.id, blocks)
        await reload()
        toast('Horario aplicado a todas las personas.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  if (activos.length === 0)
    return (
      <Card>
        <p className="text-sm text-muted">Primero agregá personas que atiendan.</p>
      </Card>
    )

  return (
    <Card title="Horarios de atención" subtitle="Cada persona puede tener su propio horario.">
      <Select label="Persona" value={who} onChange={(e) => setWho(e.target.value)}>
        {activos.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <div className="mt-4">
        <WeekEditor week={draft} onChange={setDraft} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={guardar}>
          {busy ? 'Guardando…' : 'Guardar horario'}
        </Button>
        {activos.length > 1 ? (
          <Button disabled={busy} onClick={copiarATodos}>
            Aplicar a todas
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted">
        Días de la semana según la zona horaria del negocio ({biz.timezone.replace(/_/g, ' ')}).
      </p>
    </Card>
  )
}

/* -------------------------------- Bloqueos ------------------------------- */

function TimeOffSection() {
  const { business, staff, timezone: tz } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const [rows, setRows] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState(dayKey(new Date(), tz))
  const [hasta, setHasta] = useState(addDaysKey(dayKey(new Date(), tz), 1))
  const [horaDesde, setHoraDesde] = useState('00:00')
  const [horaHasta, setHoraHasta] = useState('00:00')
  const [quien, setQuien] = useState('')
  const [motivo, setMotivo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadTimeOff(biz.id))
    } catch (e) {
      toast(dbMessage(e), 'danger')
    } finally {
      setLoading(false)
    }
  }, [biz.id, toast])

  useEffect(() => {
    void load()
  }, [load])

  const agregar = () =>
    guard(async () => {
      const from = atZone(desde, horaDesde, tz)
      const to = atZone(hasta, horaHasta, tz)
      if (to.getTime() <= from.getTime()) return toast('El fin tiene que ser después del inicio.', 'danger')
      try {
        await createTimeOff({
          business_id: biz.id,
          staff_id: quien || null,
          starts_at: from.toISOString(),
          ends_at: to.toISOString(),
          reason: motivo.trim() || null,
        })
        setMotivo('')
        await load()
        toast('Bloqueo agregado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <div className="space-y-3">
      <Card title="Nuevo bloqueo" subtitle="Vacaciones, feriados o un rato que no atendés.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde">
              <input
                type="date"
                className="fl-input"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </Field>
            <Field label="Hora">
              <input
                type="time"
                className="fl-input"
                value={horaDesde}
                onChange={(e) => setHoraDesde(e.target.value)}
              />
            </Field>
            <Field label="Hasta">
              <input
                type="date"
                className="fl-input"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </Field>
            <Field label="Hora">
              <input
                type="time"
                className="fl-input"
                value={horaHasta}
                onChange={(e) => setHoraHasta(e.target.value)}
              />
            </Field>
          </div>
          <Select label="Para" value={quien} onChange={(e) => setQuien(e.target.value)}>
            <option value="">Todo el negocio</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <TextInput
            label="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Vacaciones, feriado, médico…"
          />
          <Button variant="primary" onClick={agregar}>
            Agregar bloqueo
          </Button>
        </div>
      </Card>

      <Card title="Bloqueos cargados">
        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No hay bloqueos.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {longDayTime(t.starts_at, tz)} → {longDayTime(t.ends_at, tz)}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.staff_id ? staff.find((s) => s.id === t.staff_id)?.name : 'Todo el negocio'}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    guard(async () => {
                      try {
                        await deleteTimeOff(t.id)
                        await load()
                      } catch (e) {
                        toast(dbMessage(e), 'danger')
                      }
                    })
                  }
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------- Mensajes ------------------------------- */

function TemplatesSection() {
  const { business, setBusiness } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const [draft, setDraft] = useState<Record<TemplateKind, string>>({
    reminder: templateFor(biz.wa_templates, 'reminder'),
    confirm: templateFor(biz.wa_templates, 'confirm'),
    today: templateFor(biz.wa_templates, 'today'),
    winback: templateFor(biz.wa_templates, 'winback'),
  })
  const [busy, setBusy] = useState(false)

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        setBusiness(await updateBusiness(biz.id, { wa_templates: draft }))
        toast('Mensajes guardados.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  return (
    <Card title="Mensajes de WhatsApp" subtitle="Escribilos a tu manera. Se abren ya listos.">
      <div className="space-y-4">
        {(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map((kind) => (
          <Field key={kind} label={TEMPLATE_LABELS[kind]}>
            <textarea
              className="fl-input min-h-24"
              value={draft[kind]}
              onChange={(e) => setDraft((v) => ({ ...v, [kind]: e.target.value }))}
            />
          </Field>
        ))}

        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Variables que podés usar
          </p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {WA_VARS.map((v) => (
              <li key={v}>
                <code className="rounded bg-surface px-1 py-0.5 font-mono">{`{${v}}`}</code>{' '}
                <span className="text-muted">{WA_VAR_HELP[v]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={guardar}>
            {busy ? 'Guardando…' : 'Guardar mensajes'}
          </Button>
          <Button onClick={() => setDraft({ ...DEFAULT_TEMPLATES })}>Volver a los de fábrica</Button>
        </div>
      </div>
    </Card>
  )
}
