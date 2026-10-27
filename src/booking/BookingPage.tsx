/**
 * PÁGINA PÚBLICA DE RESERVAS · /r/:slug
 * Sin login y sin supabase-js: todo pasa por /api/public/*, que calcula la
 * disponibilidad en el servidor. Pensada para abrir rápido en 4G.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { config, manageUrl } from '../saas/config'
import { Banner, Button, Field, TextInput, cx } from '../saas/ui'
import { buildIcs, icsDataUrl } from '../shared/ics'
import { COUNTRIES, DEFAULT_COUNTRY, toE164, waLink } from '../shared/phone'
import { hhmm, longDay, shortDay } from '../shared/time'
import type { BookResponse, PublicBusiness, PublicSlotsResponse } from '../shared/types'
import { Turnstile } from './Turnstile'

type Step = 'servicio' | 'persona' | 'dia' | 'hora' | 'datos' | 'listo'

export default function BookingPage() {
  const { slug = '' } = useParams()
  const [biz, setBiz] = useState<PublicBusiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Reservar turno · Turnos'
    let alive = true
    fetch(`/api/public/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('No encontramos este negocio.')
        if (!r.ok) throw new Error('No pudimos cargar la página. Probá de nuevo.')
        return (await r.json()) as PublicBusiness
      })
      .then((b) => {
        if (!alive) return
        setBiz(b)
        document.title = `Reservar turno · ${b.name}`
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [slug])

  if (loading)
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div
          className="size-7 animate-spin rounded-full border-2 border-line border-t-brand"
          role="status"
          aria-label="Cargando"
        />
      </main>
    )

  if (error || !biz)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-display text-xl font-bold">Ups</h1>
        <p className="text-sm text-muted">{error}</p>
        <a className="text-sm underline underline-offset-2" href={config.landingUrl}>
          Conocé Turnos de Futurislabs
        </a>
      </main>
    )

  return <Booking biz={biz} />
}

function Header({ biz }: { biz: PublicBusiness }) {
  const maps = biz.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.address)}`
    : null
  return (
    <header className="flex items-start gap-3">
      {biz.logo_url ? (
        <img
          src={biz.logo_url}
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-2xl border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-bold text-on-brand"
          style={{ background: biz.color }}
        >
          {biz.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-bold leading-tight">{biz.name}</h1>
        {maps ? (
          <a
            href={maps}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm text-muted underline underline-offset-2"
          >
            📍 {biz.address}
          </a>
        ) : null}
      </div>
      {biz.whatsapp ? (
        <a
          href={waLink(biz.whatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-xl border border-transparent bg-brand px-3 py-2 text-sm font-semibold text-on-brand no-underline"
        >
          💬
          <span className="sr-only">WhatsApp</span>
        </a>
      ) : null}
    </header>
  )
}

function Booking({ biz }: { biz: PublicBusiness }) {
  const tz = biz.timezone
  const [step, setStep] = useState<Step>('servicio')
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [staffId, setStaffId] = useState<string | null>(null) // null = Cualquiera
  const [date, setDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<PublicSlotsResponse | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [start, setStart] = useState<string | null>(null)
  const [done, setDone] = useState<BookResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const service = biz.services.find((s) => s.id === serviceId) ?? null
  const posibles = useMemo(
    () =>
      biz.staff.filter(
        (s) => !serviceId || s.service_ids.length === 0 || s.service_ids.includes(serviceId)
      ),
    [biz.staff, serviceId]
  )

  const cargarSlots = useCallback(
    async (d: string | null) => {
      if (!serviceId) return
      setSlotsLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams({ service: serviceId })
        if (staffId) qs.set('staff', staffId)
        if (d) qs.set('date', d)
        const r = await fetch(`/api/public/${biz.slug}/slots?${qs}`)
        if (!r.ok) throw new Error('No pudimos ver los horarios. Probá de nuevo.')
        const body = (await r.json()) as PublicSlotsResponse
        setSlots(body)
        if (!d) {
          const primero = body.days.find((x) => x.count > 0)
          setDate(primero?.date ?? body.date)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      } finally {
        setSlotsLoading(false)
      }
    },
    [biz.slug, serviceId, staffId]
  )

  // Al elegir día, se piden los horarios de ese día.
  useEffect(() => {
    if (step === 'dia' || step === 'hora') void cargarSlots(date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, date, cargarSlots])

  if (!biz.accepting) {
    return (
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
        <Header biz={biz} />
        <Banner tone="warn">
          Este negocio no está recibiendo reservas online en este momento.
        </Banner>
        {biz.whatsapp ? (
          <a
            href={waLink(
              biz.whatsapp,
              `Hola ${biz.name}! Quería pedir un turno.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-brand px-4 py-3 text-center font-semibold text-on-brand no-underline"
          >
            💬 Pedir turno por WhatsApp
          </a>
        ) : null}
      </main>
    )
  }

  if (done) return <Confirmation biz={biz} done={done} />

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
      <Header biz={biz} />

      {biz.welcome_message && step === 'servicio' ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">{biz.welcome_message}</p>
      ) : null}

      <ol className="flex items-center gap-1.5 text-[11px] text-muted" aria-label="Pasos">
        {(['servicio', 'persona', 'dia', 'hora', 'datos'] as Step[]).map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-1.5">
            <span
              className={cx(
                'h-1.5 w-full rounded-full',
                ['servicio', 'persona', 'dia', 'hora', 'datos'].indexOf(step) >= i
                  ? 'bg-brand'
                  : 'bg-surface-2'
              )}
            />
          </li>
        ))}
      </ol>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {/* 1. Servicio */}
      {step === 'servicio' ? (
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">¿Qué te hacés?</h2>
          <ul className="space-y-2">
            {biz.services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(s.id)
                    setStaffId(null)
                    setStep(biz.staff.length > 1 ? 'persona' : 'dia')
                  }}
                  className="w-full rounded-xl border border-line bg-surface p-3 text-left hover:border-brand"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-semibold">{s.name}</span>
                    {s.price != null ? (
                      <span className="shrink-0 font-semibold">${s.price}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {s.duration_min} min
                    {s.description ? ` · ${s.description}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 2. Persona */}
      {step === 'persona' ? (
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">¿Con quién?</h2>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setStaffId(null)
                setStep('dia')
              }}
              className="w-full rounded-xl border border-brand bg-brand-soft p-3 text-left font-semibold text-brand"
            >
              Cualquiera · el primer horario libre
            </button>
            {posibles.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStaffId(s.id)
                  setStep('dia')
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-brand"
              >
                {s.photo_url ? (
                  <img src={s.photo_url} alt="" className="size-9 rounded-full object-cover" />
                ) : (
                  <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-bold">
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="font-medium">{s.name}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setStep('servicio')}>
            ← Cambiar servicio
          </Button>
        </section>
      ) : null}

      {/* 3 y 4. Día y hora */}
      {step === 'dia' || step === 'hora' ? (
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">¿Cuándo?</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {(slots?.days ?? []).map((d) => (
              <button
                key={d.date}
                type="button"
                disabled={d.count === 0}
                onClick={() => {
                  setDate(d.date)
                  setStart(null)
                  setStep('hora')
                }}
                className={cx(
                  'shrink-0 rounded-xl border px-3 py-2 text-center text-xs',
                  d.date === date
                    ? 'border-brand bg-brand-soft font-semibold text-brand'
                    : 'border-line bg-surface',
                  d.count === 0 && 'opacity-40'
                )}
              >
                <span className="block">{shortDay(`${d.date}T12:00:00Z`, 'UTC')}</span>
                <span className="block text-[10px] text-muted">
                  {d.count === 0 ? 'sin lugar' : `${d.count} libres`}
                </span>
              </button>
            ))}
          </div>

          {slotsLoading ? (
            <p className="text-sm text-muted">Buscando horarios…</p>
          ) : (slots?.slots.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">
              Ese día no quedan horarios. Probá otro día de la lista.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots!.slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => {
                    setStart(s.start)
                    setStep('datos')
                  }}
                  className={cx(
                    'rounded-xl border py-2.5 text-sm font-semibold',
                    s.start === start
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-line bg-surface hover:border-brand'
                  )}
                >
                  {hhmm(s.start, tz)}
                </button>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => setStep(biz.staff.length > 1 ? 'persona' : 'servicio')}
          >
            ← Atrás
          </Button>
        </section>
      ) : null}

      {/* 5. Datos */}
      {step === 'datos' && start && service ? (
        <DataStep
          biz={biz}
          service={service}
          start={start}
          staffId={staffId}
          slots={slots}
          onBack={() => setStep('hora')}
          onDone={setDone}
        />
      ) : null}

      <footer className="pt-2 text-center text-[11px] text-muted">
        Agenda online con{' '}
        <a className="underline underline-offset-2" href={config.landingUrl}>
          Turnos de Futurislabs
        </a>
      </footer>
    </main>
  )
}

/* --------------------------------- Datos --------------------------------- */

function DataStep({
  biz,
  service,
  start,
  staffId,
  slots,
  onBack,
  onDone,
}: {
  biz: PublicBusiness
  service: PublicBusiness['services'][number]
  start: string
  staffId: string | null
  slots: PublicSlotsResponse | null
  onBack: () => void
  onDone: (r: BookResponse) => void
}) {
  const tz = biz.timezone
  const [name, setName] = useState('')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otros, setOtros] = useState<{ start: string }[] | null>(null)

  const onToken = useCallback((t: string | null) => setToken(t), [])

  async function reservar() {
    if (busy) return
    setBusy(true)
    setError(null)
    setOtros(null)
    try {
      const e164 = toE164(phone, country)
      if (!name.trim()) throw new Error('Decinos tu nombre.')
      if (!e164) throw new Error('Revisá tu teléfono: lo usamos para avisarte del turno.')
      if (token === null) throw new Error('Completá la verificación anti-spam.')

      const r = await fetch(`/api/public/${biz.slug}/book`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service_id: service.id,
          staff_id: staffId,
          start,
          name: name.trim(),
          phone: e164,
          email: email.trim().toLowerCase() || undefined,
          notes: notes.trim() || undefined,
          turnstile_token: token,
        }),
      })
      const body = (await r.json()) as BookResponse & { error?: string; slots?: { start: string }[] }
      if (!r.ok) {
        if (body.slots) setOtros(body.slots)
        throw new Error(body.error ?? 'No pudimos confirmar el turno.')
      }
      onDone(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const persona = staffId ? biz.staff.find((s) => s.id === staffId)?.name : 'Cualquiera'

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <p className="font-semibold">{longDay(start, tz)}</p>
        <p>
          {hhmm(start, tz)} · {service.name} · {service.duration_min} min
        </p>
        <p className="text-muted">Con {persona}</p>
      </div>

      <TextInput
        label="Tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <Field label="Tu teléfono" hint="Te escribimos por WhatsApp si hay algún cambio.">
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
            autoComplete="tel"
            placeholder="11 2345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </Field>

      <TextInput
        label="Tu email (opcional)"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="Si lo dejás, te mandamos la confirmación con el turno para tu calendario."
      />

      <Field label="Algo que quieras avisar (opcional)">
        <textarea
          className="fl-input min-h-16"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <Turnstile siteKey={config.turnstileSiteKey} onToken={onToken} />

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {otros && otros.length > 0 ? (
        <div>
          <p className="fl-label">Otros horarios de ese día</p>
          <div className="grid grid-cols-3 gap-2">
            {otros.slice(0, 9).map((s) => (
              <a
                key={s.start}
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  onBack()
                }}
                className="rounded-xl border border-line bg-surface py-2 text-center text-sm font-semibold no-underline"
              >
                {hhmm(s.start, tz)}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => void reservar()}
      >
        {busy ? 'Confirmando…' : 'Confirmar turno'}
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        ← Elegir otro horario
      </Button>
      {slots && slots.slots.length === 0 ? null : null}
    </section>
  )
}

/* ------------------------------ Confirmación ----------------------------- */

function Confirmation({ biz, done }: { biz: PublicBusiness; done: BookResponse }) {
  const a = done.appointment
  const tz = a.timezone
  const ics = buildIcs({
    uid: `${done.token}@turnos.futurislabs.net`,
    start: a.start,
    end: a.end,
    title: `${a.service} · ${a.business}`,
    description: `Turno con ${a.staff}. Para confirmar o cancelar: ${manageUrl(done.token)}`,
    location: a.address ?? undefined,
    url: manageUrl(done.token),
  })

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
      <Header biz={biz} />
      <div className="rounded-2xl border border-ok/40 bg-ok-soft p-4 text-center">
        <p className="text-3xl" aria-hidden="true">
          ✅
        </p>
        <h1 className="mt-1 font-display text-xl font-bold">¡Turno confirmado!</h1>
        <p className="mt-2 text-sm">{longDay(a.start, tz)}</p>
        <p className="font-display text-2xl font-bold">{hhmm(a.start, tz)}</p>
        <p className="mt-1 text-sm">
          {a.service} · con {a.staff}
        </p>
      </div>

      <div className="space-y-2">
        <a
          href={icsDataUrl(ics)}
          download={`turno-${a.start.slice(0, 10)}.ics`}
          className="block rounded-xl border border-line bg-surface px-4 py-3 text-center font-medium no-underline"
        >
          🗓️ Agregar a mi calendario
        </a>
        {biz.whatsapp ? (
          <a
            href={waLink(
              biz.whatsapp,
              `Hola ${a.business}! Reservé ${a.service} el ${longDay(a.start, tz)} a las ${hhmm(a.start, tz)}.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-brand px-4 py-3 text-center font-semibold text-on-brand no-underline"
          >
            💬 Avisar por WhatsApp
          </a>
        ) : null}
        <a
          href={manageUrl(done.token)}
          className="block rounded-xl border border-line bg-surface px-4 py-3 text-center font-medium no-underline"
        >
          Ver o cancelar mi turno
        </a>
      </div>

      <p className="text-center text-xs text-muted">
        Guardá este link: desde ahí podés cancelar si no llegás.
      </p>
    </main>
  )
}
