/**
 * APP DEL DUEÑO · Onboarding de 4 pasos:
 *   negocio -> personas -> servicios -> horarios -> listo (link + QR)
 * Se guarda al terminar cada paso, así nadie pierde lo que escribió.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../saas/auth'
import { config } from '../saas/config'
import { Logo } from '../saas/Logo'
import { Banner, Button, Card, Field, Select, TextInput, useToast, cx } from '../saas/ui'
import { DEFAULT_TZ, TIMEZONES, WEEKDAYS } from '../shared/time'
import { COUNTRIES, DEFAULT_COUNTRY, toE164 } from '../shared/phone'
import { DEFAULT_TEMPLATES } from '../shared/whatsapp'
import type { Business } from '../shared/types'
import {
  CATEGORIES,
  DEFAULT_WEEK,
  SERVICE_TEMPLATES,
  slugify,
  type CategoryKey,
} from './catalog'
import {
  createBusiness,
  createService,
  createStaff,
  dbMessage,
  replaceHours,
  slugAvailable,
  updateBusiness,
  uploadImage,
} from './data'
import { useShop } from './shop'
import { ShareBooking } from './components/ShareBooking'

type Step = 1 | 2 | 3 | 4 | 5

const PASOS = ['Negocio', 'Personas', 'Servicios', 'Horarios']

export function Onboarding() {
  // Ojo: NO se publica el negocio en el contexto hasta terminar. Si se
  // publicara en el paso 1, la cáscara cambiaría de pantalla y se perderían
  // los pasos 2, 3 y 4.
  const { reload } = useShop()
  const [created, setCreated] = useState<Business | null>(null)
  const userId = useAuth().user!.id
  const toast = useToast()
  const [step, setStep] = useState<Step>(1)

  // Paso 1
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CategoryKey>('barberia')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'bad'>('idle')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState(DEFAULT_TZ)
  const [logo, setLogo] = useState<File | null>(null)

  // Paso 2
  const [people, setPeople] = useState<string[]>([''])

  // Paso 3
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, string>>({})

  // Paso 4
  const [week, setWeek] = useState(DEFAULT_WEEK)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdIds, setCreatedIds] = useState<{ business?: string; staff: string[] }>({ staff: [] })

  const plantillas = SERVICE_TEMPLATES[category]

  // El slug se sugiere desde el nombre hasta que el dueño lo edita a mano.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  // Chequeo de disponibilidad del link, con un respiro para no pegarle a cada tecla.
  useEffect(() => {
    const clean = slug.trim().toLowerCase()
    if (!clean) return setSlugState('idle')
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(clean)) return setSlugState('bad')
    setSlugState('checking')
    const t = setTimeout(async () => {
      const free = await slugAvailable(clean, createdIds.business)
      setSlugState(free ? 'free' : 'taken')
    }, 450)
    return () => clearTimeout(t)
  }, [slug, createdIds.business])

  useEffect(() => {
    // Al cambiar de rubro, se tildan los servicios sugeridos de ese rubro.
    const next: Record<string, boolean> = {}
    for (const s of SERVICE_TEMPLATES[category]) next[s.name] = true
    setPicked(next)
  }, [category])

  const waE164 = useMemo(() => toE164(whatsapp, country), [whatsapp, country])

  async function saveStep1() {
    if (!name.trim()) throw new Error('Ponele un nombre a tu negocio.')
    if (slugState === 'taken') throw new Error('Ese link ya está usado. Probá otro.')
    if (slugState === 'bad') throw new Error('El link solo puede tener letras, números y guiones.')
    if (!waE164) throw new Error('Revisá el WhatsApp: no parece un número válido.')

    const payload = {
      slug: slug.trim().toLowerCase(),
      name: name.trim(),
      category,
      whatsapp: waE164,
      address: address.trim() || null,
      timezone,
      wa_templates: DEFAULT_TEMPLATES,
    }

    const biz = createdIds.business
      ? await updateBusiness(createdIds.business, payload)
      : await createBusiness({ ...payload, owner_id: userId })
    setCreatedIds((v) => ({ ...v, business: biz.id }))
    setCreated(biz)

    if (logo) {
      try {
        const url = await uploadImage(biz.id, logo, 'logo')
        setCreated(await updateBusiness(biz.id, { logo_url: url }))
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    }
  }

  async function saveStep2(businessId: string) {
    const nombres = people.map((p) => p.trim()).filter(Boolean)
    const lista = nombres.length ? nombres : ['Yo']
    const ids: string[] = []
    for (const [i, nombre] of lista.entries()) {
      const s = await createStaff({ business_id: businessId, name: nombre, sort_order: i + 1 })
      ids.push(s.id)
    }
    setCreatedIds((v) => ({ ...v, staff: ids }))
  }

  async function saveStep3(businessId: string) {
    const elegidos = plantillas.filter((p) => picked[p.name])
    const lista = elegidos.length ? elegidos : [plantillas[0]!]
    for (const [i, s] of lista.entries()) {
      const precio = prices[s.name]?.replace(',', '.')
      const dur = Number(durations[s.name] ?? s.duration_min)
      await createService({
        business_id: businessId,
        name: s.name,
        duration_min: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : s.duration_min,
        price: precio ? Number(precio) : null,
        sort_order: i + 1,
      })
    }
  }

  async function saveStep4(businessId: string, staffIds: string[]) {
    const blocks = week.flatMap((d) =>
      d.blocks.map(([start_time, end_time]) => ({ weekday: d.weekday, start_time, end_time }))
    )
    for (const staffId of staffIds) await replaceHours(businessId, staffId, blocks)
  }

  async function next() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (step === 1) {
        await saveStep1()
        setStep(2)
      } else if (step === 2) {
        await saveStep2(createdIds.business!)
        setStep(3)
      } else if (step === 3) {
        await saveStep3(createdIds.business!)
        setStep(4)
      } else if (step === 4) {
        await saveStep4(createdIds.business!, createdIds.staff)
        setStep(5)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : dbMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 5) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold">¡Listo! Ya podés recibir reservas</h1>
          <p className="mt-2 text-sm text-muted">
            Compartí este link con tus clientes o imprimí el QR y pegalo en el local.
          </p>
        </div>
        <ShareBooking slug={created?.slug ?? slug} name={created?.name ?? name} />
        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          onClick={() => void reload()}
        >
          Ir a mi agenda
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="mb-5 text-center">
        <Logo className="mx-auto mb-3" size={36} />
        <h1 className="font-display text-xl font-bold">Armemos tu agenda</h1>
        <p className="mt-1 text-sm text-muted">
          Paso {step} de 4 · {PASOS[step - 1]}
        </p>
        <ol className="mt-3 flex gap-1.5" aria-label="Progreso">
          {PASOS.map((p, i) => (
            <li
              key={p}
              className={cx(
                'h-1.5 flex-1 rounded-full',
                i < step ? 'bg-brand' : 'bg-surface-2'
              )}
            />
          ))}
        </ol>
      </header>

      {error ? (
        <Banner tone="danger" className="mb-4">
          {error}
        </Banner>
      ) : null}

      {step === 1 ? (
        <Card title="Tu negocio">
          <div className="space-y-4">
            <TextInput
              label="Nombre del negocio"
              placeholder="Barbería Central"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <Field label="Rubro">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-pressed={category === c.key}
                    className={cx(
                      'rounded-xl border px-2 py-2.5 text-sm transition-colors',
                      category === c.key
                        ? 'border-brand bg-brand-soft font-semibold text-brand'
                        : 'border-line bg-surface hover:bg-surface-2'
                    )}
                  >
                    <span aria-hidden="true" className="mr-1">
                      {c.emoji}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Tu link de reservas"
              hint={
                <span className="break-all">
                  {config.origin}/r/<strong>{slug || 'tu-negocio'}</strong>
                  {slugState === 'checking' ? ' · chequeando…' : ''}
                  {slugState === 'free' ? ' · ✅ disponible' : ''}
                  {slugState === 'taken' ? ' · ❌ ya está usado' : ''}
                  {slugState === 'bad' ? ' · solo letras, números y guiones' : ''}
                </span>
              }
            >
              <input
                className="fl-input"
                value={slug}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(slugify(e.target.value))
                }}
                aria-invalid={slugState === 'taken' || slugState === 'bad'}
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
                  placeholder="11 2345 6789"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
            </Field>

            <TextInput
              label="Dirección (opcional)"
              placeholder="Av. Corrientes 1234, CABA"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              hint="La mostramos con link a Google Maps en tu página de reservas."
            />

            <Select
              label="Zona horaria"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>

            <Field label="Logo (opcional)" hint="Imagen cuadrada, hasta 2 MB.">
              <input
                type="file"
                accept="image/*"
                className="fl-input"
                onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card title="¿Quién atiende?" subtitle="Si trabajás solo, dejá solo tu nombre.">
          <div className="space-y-2">
            {people.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="fl-input"
                  placeholder={i === 0 ? 'Tu nombre' : 'Nombre'}
                  value={p}
                  onChange={(e) =>
                    setPeople((v) => v.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                {people.length > 1 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setPeople((v) => v.filter((_, j) => j !== i))}
                    aria-label={`Quitar ${p || 'persona'}`}
                  >
                    ✕
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <Button className="mt-3" onClick={() => setPeople((v) => [...v, ''])}>
            + Agregar persona
          </Button>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card
          title="Tus servicios"
          subtitle="Tildá los que hacés y ajustá duración y precio. Después podés agregar más."
        >
          <ul className="space-y-2">
            {plantillas.map((s) => {
              const on = !!picked[s.name]
              return (
                <li key={s.name} className={cx('rounded-xl border p-3', on ? 'border-brand/40 bg-brand-soft/40' : 'border-line')}>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-[var(--fl-brand)]"
                      checked={on}
                      onChange={(e) => setPicked((v) => ({ ...v, [s.name]: e.target.checked }))}
                    />
                    <span className="min-w-0 flex-1 font-medium">{s.name}</span>
                  </label>
                  {on ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-8">
                      <label className="text-xs text-muted">
                        Duración (min)
                        <input
                          className="fl-input mt-1"
                          inputMode="numeric"
                          value={durations[s.name] ?? String(s.duration_min)}
                          onChange={(e) =>
                            setDurations((v) => ({ ...v, [s.name]: e.target.value }))
                          }
                        />
                      </label>
                      <label className="text-xs text-muted">
                        Precio (opcional)
                        <input
                          className="fl-input mt-1"
                          inputMode="decimal"
                          placeholder="0"
                          value={prices[s.name] ?? ''}
                          onChange={(e) => setPrices((v) => ({ ...v, [s.name]: e.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card
          title="Tus horarios"
          subtitle="Podés tener dos bloques por día (por ejemplo 9 a 13 y 15 a 20)."
        >
          <WeekEditor week={week} onChange={setWeek} />
          <p className="mt-3 text-xs text-muted">
            Este horario se aplica a todas las personas. Después, en Ajustes, podés darle un
            horario distinto a cada una.
          </p>
        </Card>
      ) : null}

      <div className="mt-5 flex gap-2">
        {step > 1 ? (
          <Button size="lg" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy}>
            Atrás
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={() => void next()}
          disabled={busy || (step === 1 && (slugState === 'taken' || slugState === 'bad'))}
        >
          {busy ? 'Guardando…' : step === 4 ? 'Terminar' : 'Seguir'}
        </Button>
      </div>
    </main>
  )
}

/** Editor del horario semanal: bloques por día. */
export function WeekEditor({
  week,
  onChange,
}: {
  week: { weekday: number; blocks: [string, string][] }[]
  onChange: (w: { weekday: number; blocks: [string, string][] }[]) => void
}) {
  const set = (weekday: number, blocks: [string, string][]) =>
    onChange(week.map((d) => (d.weekday === weekday ? { ...d, blocks } : d)))

  return (
    <ul className="space-y-2">
      {week.map((d) => (
        <li key={d.weekday} className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{WEEKDAYS[d.weekday]}</span>
            {d.blocks.length === 0 ? (
              <Button
                size="sm"
                onClick={() => set(d.weekday, [['09:00', '18:00']])}
              >
                Abrir
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set(d.weekday, [])}
              >
                Cerrado
              </Button>
            )}
          </div>
          {d.blocks.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Cerrado</p>
          ) : (
            <div className="mt-2 space-y-2">
              {d.blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    className="fl-input min-w-0 flex-1"
                    value={b[0]}
                    onChange={(e) =>
                      set(
                        d.weekday,
                        d.blocks.map((x, j) => (j === i ? [e.target.value, x[1]] : x))
                      )
                    }
                    aria-label={`${WEEKDAYS[d.weekday]}: desde`}
                  />
                  <span className="shrink-0 text-muted">a</span>
                  <input
                    type="time"
                    className="fl-input min-w-0 flex-1"
                    value={b[1]}
                    onChange={(e) =>
                      set(
                        d.weekday,
                        d.blocks.map((x, j) => (j === i ? [x[0], e.target.value] : x))
                      )
                    }
                    aria-label={`${WEEKDAYS[d.weekday]}: hasta`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set(d.weekday, d.blocks.filter((_, j) => j !== i))}
                    aria-label="Quitar bloque"
                  >
                    ✕
                  </Button>
                </div>
              ))}
              {d.blocks.length < 3 ? (
                <Button
                  size="sm"
                  onClick={() => set(d.weekday, [...d.blocks, ['15:00', '20:00']])}
                >
                  + Otro bloque
                </Button>
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
