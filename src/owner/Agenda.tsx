/**
 * APP DEL DUEÑO · Agenda.
 *   Día:    columnas por persona en la compu; una persona a la vez en el celu.
 *   Semana: los 7 días de un vistazo (tocar un día lo abre).
 * Tocar un hueco crea un turno; tocar un turno abre su ficha. En la compu se
 * puede arrastrar un turno a otro hueco para reprogramarlo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button, Card, useToast, cx } from '../saas/ui'
import {
  addDaysKey,
  atZone,
  dayKey,
  dayRange,
  hhmm,
  longDay,
  minutesOfDay,
  shortDay,
  todayKey,
  weekStart,
  WEEKDAYS_SHORT,
} from '../shared/time'
import { formatHm, parseHm } from '../shared/slots'
import type { AppointmentFull } from '../shared/types'
import { dbMessage, loadAppointments, updateAppointment } from './data'
import { useShop } from './shop'
import { useGuard, useReadOnly } from './guards'
import { AppointmentSheet, statusLabel, statusTone } from './components/AppointmentSheet'
import { NewAppointment } from './components/NewAppointment'

/** Alto de un minuto en píxeles (30 min = 48 px: cómodo para el dedo). */
const PX_MIN = 1.6
const FALLBACK = { open: 8 * 60, close: 20 * 60 }

export function Agenda() {
  const { business, staff, services, staffServices, timezone: tz } = useShop()
  const toast = useToast()
  const guard = useGuard()
  const readOnly = useReadOnly()
  const biz = business!

  const [view, setView] = useState<'dia' | 'semana'>('dia')
  const [date, setDate] = useState(() => todayKey(tz))
  const activos = useMemo(() => staff.filter((s) => s.active), [staff])
  const [staffTab, setStaffTab] = useState<string>('')
  const [appts, setAppts] = useState<AppointmentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AppointmentFull | null>(null)
  const [nuevo, setNuevo] = useState<{ date: string; time: string; staffId: string } | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!staffTab && activos[0]) setStaffTab(activos[0].id)
  }, [activos, staffTab])

  const from = view === 'dia' ? date : weekStart(date)
  const days = view === 'dia' ? 1 : 7

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const a = dayRange(from, tz).from
      const b = dayRange(addDaysKey(from, days - 1), tz).to
      const rows = await loadAppointments(biz.id, a, b)
      if (alive.current) setAppts(rows)
    } catch (e) {
      if (alive.current) setError(dbMessage(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [biz.id, from, days, tz])

  useEffect(() => {
    void load()
  }, [load])

  const upsert = (a: AppointmentFull | null) => {
    if (!a) return void load()
    setAppts((v) => {
      const i = v.findIndex((x) => x.id === a.id)
      const next = i === -1 ? [...v, a] : v.map((x) => (x.id === a.id ? a : x))
      return next.sort((x, y) => x.starts_at.localeCompare(y.starts_at))
    })
    setOpen((o) => (o && o.id === a.id ? a : o))
  }

  /** Arrastrar un turno a otro hueco (solo en la compu). */
  const mover = (appt: AppointmentFull, newDate: string, newMin: number, newStaff: string) =>
    guard(async () => {
      const dur = new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()
      const start = atZone(newDate, formatHm(newMin), tz)
      try {
        upsert(
          await updateAppointment(appt.id, {
            starts_at: start.toISOString(),
            ends_at: new Date(start.getTime() + dur).toISOString(),
            staff_id: newStaff,
          })
        )
        toast('Turno reprogramado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  const hoy = todayKey(tz)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-surface p-0.5" role="tablist">
          {(['dia', 'semana'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cx(
                'rounded-[10px] px-3 py-1.5 text-sm font-medium',
                view === v ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'
              )}
            >
              {v === 'dia' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => setDate((d) => addDaysKey(d, view === 'dia' ? -1 : -7))}
            aria-label="Anterior"
          >
            ‹
          </Button>
          <Button size="sm" onClick={() => setDate(hoy)}>
            Hoy
          </Button>
          <Button
            size="sm"
            onClick={() => setDate((d) => addDaysKey(d, view === 'dia' ? 1 : 7))}
            aria-label="Siguiente"
          >
            ›
          </Button>
        </div>
        <input
          type="date"
          className="fl-input w-auto flex-1 py-1.5 text-sm"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Ir a una fecha"
        />
      </div>

      <p className="font-display text-base font-semibold">
        {view === 'dia'
          ? longDay(dayRange(date, tz).from, tz)
          : `Semana del ${shortDay(dayRange(weekStart(date), tz).from, tz)}`}
        {view === 'dia' && date === hoy ? <span className="text-brand"> · hoy</span> : null}
      </p>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {readOnly ? (
        <Banner tone="warn">Tu plan no está activo: podés mirar la agenda pero no cambiarla.</Banner>
      ) : null}

      {activos.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Todavía no cargaste a nadie que atienda. Agregá personas en Ajustes.
          </p>
        </Card>
      ) : view === 'dia' ? (
        <>
          {/* En el celu, una persona a la vez */}
          {activos.length > 1 ? (
            <div className="flex gap-1 overflow-x-auto pb-1 md:hidden">
              {activos.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStaffTab(s.id)}
                  aria-pressed={staffTab === s.id}
                  className={cx(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm',
                    staffTab === s.id
                      ? 'border-brand bg-brand-soft font-semibold text-brand'
                      : 'border-line bg-surface text-muted'
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}

          <DayGrid
            date={date}
            tz={tz}
            appts={appts}
            columns={activos}
            mobileColumn={staffTab}
            loading={loading}
            onPick={(d, min, staffId) =>
              guard(() => setNuevo({ date: d, time: formatHm(min), staffId }))
            }
            onOpen={setOpen}
            onDropAppt={mover}
            canDrag={!readOnly}
          />
        </>
      ) : (
        <WeekList
          start={weekStart(date)}
          tz={tz}
          appts={appts}
          loading={loading}
          onOpen={setOpen}
          onDay={(d) => {
            setDate(d)
            setView('dia')
          }}
        />
      )}

      {open ? (
        <AppointmentSheet
          appt={open}
          business={biz}
          staff={activos}
          onClose={() => setOpen(null)}
          onChanged={upsert}
        />
      ) : null}

      {nuevo ? (
        <NewAppointment
          business={biz}
          staff={activos}
          services={services}
          staffServices={staffServices}
          date={nuevo.date}
          time={nuevo.time}
          staffId={nuevo.staffId}
          onClose={() => setNuevo(null)}
          onCreated={(a) => {
            upsert(a)
            setNuevo(null)
          }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------ Vista de Día ------------------------------ */

function DayGrid({
  date,
  tz,
  appts,
  columns,
  mobileColumn,
  loading,
  onPick,
  onOpen,
  onDropAppt,
  canDrag,
}: {
  date: string
  tz: string
  appts: AppointmentFull[]
  columns: { id: string; name: string }[]
  mobileColumn: string
  loading: boolean
  onPick: (date: string, minute: number, staffId: string) => void
  onOpen: (a: AppointmentFull) => void
  onDropAppt: (a: AppointmentFull, date: string, minute: number, staffId: string) => void
  canDrag: boolean
}) {
  const { hours } = useShop()

  // Ventana visible: lo que abre el negocio ese día, más margen.
  const { open, close } = useMemo(() => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const delDia = hours.filter((h) => h.weekday === weekday)
    if (delDia.length === 0) return FALLBACK
    const o = Math.min(...delDia.map((h) => parseHm(h.start_time)))
    const c = Math.max(...delDia.map((h) => parseHm(h.end_time)))
    return { open: Math.max(0, o - 30), close: Math.min(24 * 60, c + 30) }
  }, [hours, date])

  const total = close - open
  const altura = total * PX_MIN
  // Etiquetas solo en las horas redondas que caen dentro de la ventana.
  const horasEnPunto = Array.from(
    { length: Math.floor(close / 60) - Math.ceil(open / 60) + 1 },
    (_, i) => (Math.ceil(open / 60) + i) * 60
  ).filter((m) => m >= open && m <= close)
  const [dragging, setDragging] = useState<AppointmentFull | null>(null)

  const visibles = columns
  const delDia = appts.filter((a) => dayKey(a.starts_at, tz) === date)

  return (
    <Card className="overflow-hidden p-0">
      {loading ? <p className="px-4 py-3 text-sm text-muted">Cargando turnos…</p> : null}
      <div className="flex">
        {/* Eje de horas. El hueco de arriba iguala el alto del nombre de la
            persona, para que las horas queden alineadas con la grilla. */}
        <div className="w-11 shrink-0 border-r border-line">
          <p aria-hidden="true" className="border-b border-line px-1 py-1.5 text-xs font-semibold text-transparent">
            &nbsp;
          </p>
          <div className="relative" style={{ height: altura }}>
            {horasEnPunto.map((m) => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                style={{ top: (m - open) * PX_MIN }}
              >
                {formatHm(m)}
              </span>
            ))}
          </div>
        </div>

        {/* Columnas por persona */}
        <div className="flex min-w-0 flex-1">
          {visibles.map((col) => (
            <div
              key={col.id}
              className={cx(
                'min-w-0 flex-1 border-r border-line last:border-r-0',
                col.id === mobileColumn ? '' : 'hidden md:block'
              )}
            >
              <p className="sticky top-14 z-10 truncate border-b border-line bg-surface px-2 py-1.5 text-center text-xs font-semibold">
                {col.name}
              </p>
              <div className="relative" style={{ height: altura }}>
                {/* Huecos: cada celda crea un turno y recibe los arrastrados */}
                {Array.from({ length: Math.floor(total / 30) }, (_, i) => open + i * 30).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onPick(date, m, col.id)}
                      onDragOver={(e) => {
                        if (dragging) e.preventDefault()
                      }}
                      onDrop={() => {
                        if (dragging) onDropAppt(dragging, date, m, col.id)
                        setDragging(null)
                      }}
                      aria-label={`Nuevo turno ${formatHm(m)} con ${col.name}`}
                      className={cx(
                        'absolute inset-x-0 border-b border-line/70 text-left',
                        'hover:bg-brand-soft/60 focus-visible:bg-brand-soft',
                        m % 60 === 0 ? 'border-line' : 'border-dashed'
                      )}
                      style={{ top: (m - open) * PX_MIN, height: 30 * PX_MIN }}
                    />
                  )
                )}

                {/* Turnos */}
                {delDia
                  .filter((a) => a.staff_id === col.id)
                  .map((a) => {
                    const start = minutesOfDay(a.starts_at, tz)
                    const end = minutesOfDay(a.ends_at, tz)
                    const top = (Math.max(open, start) - open) * PX_MIN
                    const h = Math.max(22, (Math.min(close, end) - Math.max(open, start)) * PX_MIN)
                    const cancelado = a.status === 'cancelled'
                    return (
                      <button
                        key={a.id}
                        type="button"
                        draggable={canDrag}
                        onDragStart={() => setDragging(a)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => onOpen(a)}
                        className={cx(
                          'absolute inset-x-0.5 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight',
                          'border-brand/40 bg-brand-soft hover:border-brand',
                          cancelado && 'opacity-50 line-through',
                          a.status === 'no_show' && 'border-danger/40 bg-danger-soft',
                          a.status === 'completed' && 'border-ok/40 bg-ok-soft',
                          a.status === 'pending' && 'border-warn/50 bg-warn-soft'
                        )}
                        style={{ top, height: h }}
                      >
                        <span className="block truncate font-semibold">
                          {hhmm(a.starts_at, tz)} {a.client?.name ?? 'Turno'}
                        </span>
                        <span className="block truncate text-muted">
                          {a.service?.name ?? ''}
                          {a.source === 'online' ? ' · online' : ''}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        Tocá un hueco para cargar un turno. {canDrag ? 'En la compu podés arrastrar un turno para moverlo.' : ''}
      </p>
    </Card>
  )
}

/* ----------------------------- Vista de Semana ---------------------------- */

function WeekList({
  start,
  tz,
  appts,
  loading,
  onOpen,
  onDay,
}: {
  start: string
  tz: string
  appts: AppointmentFull[]
  loading: boolean
  onOpen: (a: AppointmentFull) => void
  onDay: (date: string) => void
}) {
  const hoy = todayKey(tz)
  const dias = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i))

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {loading ? <p className="text-sm text-muted">Cargando turnos…</p> : null}
      {dias.map((d) => {
        const delDia = appts.filter(
          (a) => dayKey(a.starts_at, tz) === d && a.status !== 'cancelled'
        )
        const weekday = new Date(`${d}T00:00:00Z`).getUTCDay()
        return (
          <section
            key={d}
            className={cx(
              'fl-card p-3',
              d === hoy && 'border-brand/50 ring-1 ring-brand/30'
            )}
          >
            <header className="mb-2 flex items-baseline justify-between gap-2">
              <button
                type="button"
                onClick={() => onDay(d)}
                className="font-display text-sm font-semibold underline-offset-2 hover:underline"
              >
                {WEEKDAYS_SHORT[weekday]} {d.slice(8)}/{d.slice(5, 7)}
              </button>
              <span className="text-xs text-muted">
                {delDia.length === 0 ? 'libre' : `${delDia.length} turno${delDia.length === 1 ? '' : 's'}`}
              </span>
            </header>
            <ul className="space-y-1">
              {delDia.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(a)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                  >
                    <span className="font-mono font-semibold">{hhmm(a.starts_at, tz)}</span>
                    <span className="min-w-0 flex-1 truncate">{a.client?.name ?? 'Turno'}</span>
                    <span
                      className={cx(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px]',
                        statusTone(a.status)
                      )}
                    >
                      {a.staff?.name ?? statusLabel(a.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
