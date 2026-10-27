/** APP DEL DUEÑO · Inicio: cómo viene el día, lo que sigue y el mes. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Card, cx } from '../saas/ui'
import { useSubscription } from '../saas/subscription'
import { addDaysKey, dayKey, dayRange, hhmm, longDay, todayKey } from '../shared/time'
import type { AppointmentFull } from '../shared/types'
import { dbMessage, loadAppointments } from './data'
import { useShop } from './shop'
import { ShareBooking } from './components/ShareBooking'
import { AppointmentSheet } from './components/AppointmentSheet'

export function Home() {
  const { business, staff, timezone: tz, newOnline, clearNewOnline } = useShop()
  const { access } = useSubscription()
  const biz = business!
  const hoy = todayKey(tz)

  const [appts, setAppts] = useState<AppointmentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AppointmentFull | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Mes corriente + los próximos 7 días (para "lo que sigue").
      const desde = dayRange(`${hoy.slice(0, 7)}-01`, tz).from
      const hasta = dayRange(addDaysKey(hoy, 8), tz).to
      setAppts(await loadAppointments(biz.id, desde, hasta))
    } catch (e) {
      setError(dbMessage(e))
    } finally {
      setLoading(false)
    }
  }, [biz.id, hoy, tz])

  useEffect(() => {
    void load()
  }, [load])

  // Al entrar una reserva online (Realtime), refrescamos.
  useEffect(() => {
    if (newOnline > 0) {
      void load()
      clearNewOnline()
    }
  }, [newOnline, load, clearNewOnline])

  const stats = useMemo(() => {
    const delMes = appts.filter((a) => dayKey(a.starts_at, tz).startsWith(hoy.slice(0, 7)))
    const activos = delMes.filter((a) => a.status !== 'cancelled')
    const completados = delMes.filter((a) => a.status === 'completed')
    const noShows = delMes.filter((a) => a.status === 'no_show')
    const atendidos = completados.length + noShows.length
    const ingresos = completados.reduce((sum, a) => sum + Number(a.price ?? a.service?.price ?? 0), 0)
    return {
      mes: activos.length,
      ingresos,
      noShowPct: atendidos === 0 ? 0 : Math.round((noShows.length / atendidos) * 100),
      noShows: noShows.length,
    }
  }, [appts, hoy, tz])

  const delDia = appts
    .filter((a) => dayKey(a.starts_at, tz) === hoy && a.status !== 'cancelled')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const ahora = Date.now()
  const proximos = appts
    .filter(
      (a) =>
        a.status !== 'cancelled' &&
        new Date(a.starts_at).getTime() > ahora &&
        dayKey(a.starts_at, tz) !== hoy
    )
    .slice(0, 5)

  return (
    <div className="space-y-3">
      {access.level === 'readonly' ? (
        <Banner tone="danger">
          <span className="min-w-0 flex-1">
            Tu plan no está activo: tu página de reservas está pausada.
          </span>
          <Link to="/plan" className="font-semibold underline underline-offset-2">
            Reactivar
          </Link>
        </Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Hoy" value={delDia.length} hint={`turno${delDia.length === 1 ? '' : 's'}`} />
        <Stat label="Este mes" value={stats.mes} hint="turnos" />
        <Stat
          label="Ingresos del mes"
          value={`$${stats.ingresos.toLocaleString('es-AR')}`}
          hint="turnos marcados como asistió"
        />
        <Stat
          label="No-shows"
          value={`${stats.noShowPct}%`}
          hint={`${stats.noShows} este mes`}
          tone={stats.noShowPct >= 15 ? 'warn' : undefined}
        />
      </div>

      <Card
        title="Hoy"
        subtitle={longDay(dayRange(hoy, tz).from, tz)}
        actions={
          <Link
            to="/agenda"
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium no-underline hover:bg-surface-2"
          >
            Ver agenda
          </Link>
        }
      >
        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : delDia.length === 0 ? (
          <p className="text-sm text-muted">
            Hoy no tenés turnos. Buen momento para escribirles a los clientes que no vienen hace
            rato desde <Link to="/recordatorios" className="underline underline-offset-2">Recordar</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--fl-border)]">
            {delDia.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="flex w-full items-center gap-3 py-2 text-left"
                >
                  <span className="font-mono text-sm font-bold">{hhmm(a.starts_at, tz)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.client?.name ?? 'Turno'}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.service?.name} · {a.staff?.name}
                    </span>
                  </span>
                  {a.status === 'completed' ? (
                    <span className="shrink-0 text-ok">✓</span>
                  ) : a.status === 'no_show' ? (
                    <span className="shrink-0 text-danger">🚫</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {proximos.length > 0 ? (
        <Card title="Lo que sigue">
          <ul className="space-y-1 text-sm">
            {proximos.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {longDay(a.starts_at, tz)} · {hhmm(a.starts_at, tz)}
                </span>
                <span className="shrink-0 truncate text-xs text-muted">{a.client?.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ShareBooking slug={biz.slug} name={biz.name} />

      {open ? (
        <AppointmentSheet
          appt={open}
          business={biz}
          staff={staff.filter((s) => s.active)}
          onClose={() => setOpen(null)}
          onChanged={(a) => {
            if (!a) return void load()
            setAppts((v) => v.map((x) => (x.id === a.id ? a : x)))
            setOpen(a)
          }}
        />
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'warn'
}) {
  return (
    <div className={cx('fl-card p-3', tone === 'warn' && 'border-warn/40 bg-warn-soft')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-xl font-bold leading-tight">{value}</p>
      {hint ? <p className="truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}
