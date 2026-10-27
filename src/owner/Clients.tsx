/** APP DEL DUEÑO · Clientes: búsqueda, historial, no-shows y notas. */
import { useCallback, useEffect, useState } from 'react'
import { Banner, Button, Card, Modal, TextInput, useToast, cx } from '../saas/ui'
import { formatPhone, waLink } from '../shared/phone'
import { hhmm, longDay } from '../shared/time'
import type { AppointmentFull, Client } from '../shared/types'
import { dbMessage, loadClientHistory, loadClients, updateClient } from './data'
import { useShop } from './shop'
import { useGuard } from './guards'
import { statusLabel, statusTone } from './components/AppointmentSheet'

export function Clients() {
  const { business, timezone: tz } = useShop()
  const biz = business!
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Client | null>(null)

  const load = useCallback(
    async (q: string) => {
      setLoading(true)
      setError(null)
      try {
        setRows(await loadClients(biz.id, q))
      } catch (e) {
        setError(dbMessage(e))
      } finally {
        setLoading(false)
      }
    },
    [biz.id]
  )

  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, load])

  return (
    <div className="space-y-3">
      <Card title="Clientes" subtitle={`${rows.length} en la lista`}>
        <input
          className="fl-input"
          type="search"
          placeholder="Buscar por nombre, teléfono o mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar cliente"
        />
        {error ? (
          <Banner tone="danger" className="mt-3">
            {error}
          </Banner>
        ) : null}
        {loading ? (
          <p className="mt-3 text-sm text-muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {search
              ? 'No encontramos a nadie con esos datos.'
              : 'Todavía no hay clientes. Se cargan solos con cada reserva.'}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--fl-border)]">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted">{formatPhone(c.phone)}</p>
                </button>
                <a
                  href={waLink(c.phone)}
                  target="_blank"
                  rel="noopener"
                  aria-label={`WhatsApp a ${c.name}`}
                  className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm no-underline hover:bg-surface-2"
                >
                  💬
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open ? (
        <ClientSheet
          client={open}
          tz={tz}
          onClose={() => setOpen(null)}
          onSaved={(c) => {
            setRows((v) => v.map((x) => (x.id === c.id ? c : x)))
            setOpen(c)
          }}
        />
      ) : null}
    </div>
  )
}

function ClientSheet({
  client,
  tz,
  onClose,
  onSaved,
}: {
  client: Client
  tz: string
  onClose: () => void
  onSaved: (c: Client) => void
}) {
  const toast = useToast()
  const guard = useGuard()
  const [history, setHistory] = useState<AppointmentFull[] | null>(null)
  const [notes, setNotes] = useState(client.notes ?? '')
  const [name, setName] = useState(client.name)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadClientHistory(client.id)
      .then((h) => alive && setHistory(h))
      .catch(() => alive && setHistory([]))
    return () => {
      alive = false
    }
  }, [client.id])

  const noShows = history?.filter((a) => a.status === 'no_show').length ?? 0
  const completados = history?.filter((a) => a.status === 'completed').length ?? 0

  const guardar = () =>
    guard(async () => {
      setBusy(true)
      try {
        onSaved(
          await updateClient(client.id, { name: name.trim() || client.name, notes: notes.trim() || null })
        )
        toast('Cliente guardado.')
      } catch (e) {
        toast(dbMessage(e), 'danger')
      } finally {
        setBusy(false)
      }
    })

  return (
    <Modal open onClose={onClose} title={client.name}>
      <div className="flex flex-wrap gap-2">
        <a
          href={`tel:${client.phone}`}
          className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium no-underline hover:bg-surface-2"
        >
          📞 {formatPhone(client.phone)}
        </a>
        <a
          href={waLink(client.phone)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center rounded-xl border border-transparent bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand no-underline hover:bg-brand-strong"
        >
          💬 WhatsApp
        </a>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['Turnos', history?.length ?? '—'],
          ['Asistió', completados],
          ['No vino', noShows],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-surface-2 p-2">
            <p className="font-display text-lg font-bold">{String(value)}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {noShows >= 2 ? (
        <Banner tone="warn" className="mt-3">
          Faltó {noShows} veces sin avisar. Quizá conviene pedirle que confirme.
        </Banner>
      ) : null}

      <div className="mt-4 space-y-3">
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <label className="fl-label" htmlFor="client-notes">
            Notas
          </label>
          <textarea
            id="client-notes"
            className="fl-input min-h-20"
            placeholder="Preferencias, alergias, lo que te sirva recordar."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          disabled={busy || (name === client.name && notes === (client.notes ?? ''))}
          onClick={guardar}
        >
          Guardar
        </Button>
      </div>

      <div className="mt-5">
        <p className="fl-label">Historial</p>
        {history === null ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">Todavía no tiene turnos.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.slice(0, 30).map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {longDay(a.starts_at, tz)} · {hhmm(a.starts_at, tz)}
                </span>
                <span className="shrink-0 truncate text-xs text-muted">{a.service?.name}</span>
                <span
                  className={cx(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    statusTone(a.status)
                  )}
                >
                  {statusLabel(a.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
