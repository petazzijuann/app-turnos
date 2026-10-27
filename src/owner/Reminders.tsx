/**
 * APP DEL DUEÑO · Recordatorios por WhatsApp.
 * Flujo de un toque por cliente: "Recordar" abre WhatsApp con el mensaje
 * escrito y, al volver, el turno queda marcado y pasa el siguiente.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button, Card, useToast, cx } from '../saas/ui'
import { addDaysKey, dayRange, hhmm, longDay, todayKey } from '../shared/time'
import { formatPhone, waLink } from '../shared/phone'
import { renderTemplate, templateFor } from '../shared/whatsapp'
import type { AppointmentFull, Client } from '../shared/types'
import { dbMessage, loadAppointments, loadClients, markReminded } from './data'
import { useShop } from './shop'
import { useGuard, useReadOnly } from './guards'
import { pendingFor, reminderLink } from './reminders'

type Tab = 'manana' | 'hoy' | 'extranamos'

export function Reminders({ onChange }: { onChange: () => void }) {
  const { business, timezone: tz } = useShop()
  const biz = business!
  const toast = useToast()
  const guard = useGuard()
  const readOnly = useReadOnly()

  const [tab, setTab] = useState<Tab>('manana')
  const [appts, setAppts] = useState<AppointmentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const fecha = tab === 'hoy' ? todayKey(tz) : addDaysKey(todayKey(tz), 1)

  const load = useCallback(async () => {
    if (tab === 'extranamos') return
    setLoading(true)
    setError(null)
    try {
      const { from, to } = dayRange(fecha, tz)
      const rows = await loadAppointments(biz.id, from, to)
      if (alive.current) setAppts(rows)
    } catch (e) {
      if (alive.current) setError(dbMessage(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [biz.id, fecha, tz, tab])

  useEffect(() => {
    void load()
  }, [load])

  const pendientes = useMemo(() => pendingFor(appts), [appts])
  const yaRecordados = useMemo(
    () => appts.filter((a) => a.reminded_at && a.status !== 'cancelled'),
    [appts]
  )

  const recordar = (a: AppointmentFull) =>
    guard(async () => {
      const kind = tab === 'hoy' ? 'today' : 'reminder'
      const link = reminderLink(biz, a, kind)
      if (!link) return toast('Ese cliente no tiene teléfono cargado.', 'danger')
      window.open(link, '_blank', 'noopener')
      try {
        const updated = await markReminded(a.id)
        setAppts((v) => v.map((x) => (x.id === a.id ? updated : x)))
        onChange()
      } catch (e) {
        toast(dbMessage(e), 'danger')
      }
    })

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {(
          [
            ['manana', 'Mañana'],
            ['hoy', 'Hoy'],
            ['extranamos', 'Te extrañamos'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm',
              tab === k
                ? 'border-brand bg-brand-soft font-semibold text-brand'
                : 'border-line bg-surface text-muted'
            )}
          >
            {label}
            {k !== 'extranamos' && tab === k && pendientes.length > 0 ? ` · ${pendientes.length}` : ''}
          </button>
        ))}
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {readOnly ? <Banner tone="warn">Reactivá tu plan para marcar recordatorios.</Banner> : null}

      {tab === 'extranamos' ? (
        <WinBack />
      ) : (
        <>
          <Card
            title={`Turnos de ${tab === 'hoy' ? 'hoy' : 'mañana'}`}
            subtitle={longDay(dayRange(fecha, tz).from, tz)}
            actions={
              <Button size="sm" onClick={() => void load()}>
                Actualizar
              </Button>
            }
          >
            {loading ? (
              <p className="text-sm text-muted">Cargando…</p>
            ) : pendientes.length === 0 ? (
              <p className="text-sm text-muted">
                {appts.length === 0
                  ? `No hay turnos para ${tab === 'hoy' ? 'hoy' : 'mañana'}.`
                  : '¡Listo! Ya recordaste todos los turnos.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {pendientes.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.client?.name}</p>
                      <p className="truncate text-sm text-muted">
                        {hhmm(a.starts_at, tz)} · {a.service?.name ?? 'Turno'} ·{' '}
                        {a.staff?.name ?? ''}
                      </p>
                      <p className="text-xs text-muted">{formatPhone(a.client?.phone)}</p>
                    </div>
                    <Button variant="primary" onClick={() => recordar(a)}>
                      💬 Recordar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {yaRecordados.length > 0 ? (
            <Card title="Ya recordados" subtitle={`${yaRecordados.length} de ${appts.length}`}>
              <ul className="space-y-1 text-sm text-muted">
                {yaRecordados.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-ok">
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {hhmm(a.starts_at, tz)} · {a.client?.name}
                    </span>
                    {a.client?.phone ? (
                      <a
                        className="underline underline-offset-2"
                        href={reminderLink(biz, a) ?? '#'}
                        target="_blank"
                        rel="noopener"
                      >
                        Reenviar
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ------------------------- "Te extrañamos" (winback) ---------------------- */

function WinBack() {
  const { business, timezone: tz } = useShop()
  const biz = business!
  const [dias, setDias] = useState(45)
  const [rows, setRows] = useState<{ client: Client; last: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const clientes = await loadClients(biz.id)
      // Último turno de cada cliente, en una sola consulta por el negocio.
      const hace = new Date(Date.now() - dias * 86_400_000)
      const recientes = await loadAppointments(biz.id, hace, new Date(Date.now() + 86_400_000))
      const conTurno = new Set(
        recientes.filter((a) => a.status !== 'cancelled').map((a) => a.client_id)
      )
      const futuro = await loadAppointments(
        biz.id,
        new Date(),
        new Date(Date.now() + 90 * 86_400_000)
      )
      const conFuturo = new Set(futuro.filter((a) => a.status !== 'cancelled').map((a) => a.client_id))
      setRows(
        clientes
          .filter((c) => !conTurno.has(c.id) && !conFuturo.has(c.id))
          .map((c) => ({ client: c, last: null }))
      )
    } catch (e) {
      setError(dbMessage(e))
    } finally {
      setLoading(false)
    }
  }, [biz.id, dias])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card
      title="Clientes que no vienen hace rato"
      subtitle="Escribiles con un toque para llenar los huecos de la semana."
      actions={
        <select
          className="fl-input w-auto py-1.5 text-sm"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          aria-label="Hace cuánto no vienen"
        >
          {[30, 45, 60, 90].map((d) => (
            <option key={d} value={d}>
              +{d} días
            </option>
          ))}
        </select>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {loading ? (
        <p className="text-sm text-muted">Buscando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          Buenas noticias: todos tus clientes pasaron en los últimos {dias} días (o ya tienen turno).
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 50).map(({ client }) => (
            <li
              key={client.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{client.name}</p>
                <p className="text-xs text-muted">{formatPhone(client.phone)}</p>
              </div>
              <a
                href={waLink(
                  client.phone,
                  renderTemplate(templateFor(biz.wa_templates, 'winback'), {
                    nombre: client.name.split(' ')[0] ?? '',
                    negocio: biz.name,
                  })
                )}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center rounded-xl border border-transparent bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand no-underline hover:bg-brand-strong"
              >
                💬 Escribir
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        Zona horaria del negocio: {tz.replace(/_/g, ' ')}.
      </p>
    </Card>
  )
}
