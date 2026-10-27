/**
 * PÁGINA DEL CLIENTE · /c/:token
 * Ver el turno, confirmarlo o cancelarlo (respetando la política del negocio).
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { config } from '../saas/config'
import { Banner, Button } from '../saas/ui'
import { buildIcs, icsDataUrl } from '../shared/ics'
import { waLink } from '../shared/phone'
import { hhmm, longDay } from '../shared/time'
import type { ManageResponse } from '../shared/types'

export default function ManagePage() {
  const { token = '' } = useParams()
  const [data, setData] = useState<ManageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/manage/${encodeURIComponent(token)}`)
      if (r.status === 404) throw new Error('No encontramos este turno. Revisá el link.')
      if (!r.ok) throw new Error('No pudimos cargar tu turno.')
      setData((await r.json()) as ManageResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }, [token])

  useEffect(() => {
    document.title = 'Mi turno · Turnos'
    void load()
  }, [load])

  async function accion(action: 'confirm' | 'cancel') {
    if (busy) return
    if (action === 'cancel' && !confirm('¿Seguro que querés cancelar tu turno?')) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/public/manage/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = (await r.json()) as ManageResponse & { error?: string }
      if (!r.ok) throw new Error(body.error ?? 'No pudimos hacer el cambio.')
      setData(body)
      setMsg(action === 'cancel' ? 'Cancelamos tu turno. ¡Gracias por avisar!' : '¡Listo, turno confirmado!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  if (error && !data)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-display text-xl font-bold">Ups</h1>
        <p className="text-sm text-muted">{error}</p>
        <a className="text-sm underline underline-offset-2" href={config.landingUrl}>
          Turnos de Futurislabs
        </a>
      </main>
    )

  if (!data)
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div
          className="size-7 animate-spin rounded-full border-2 border-line border-t-brand"
          role="status"
          aria-label="Cargando"
        />
      </main>
    )

  const tz = data.business.timezone
  const cancelado = data.status === 'cancelled'
  const ics = buildIcs({
    uid: `${token}@turnos.futurislabs.net`,
    start: data.start,
    end: data.end,
    title: `${data.service} · ${data.business.name}`,
    description: `Turno con ${data.staff}.`,
    location: data.business.address ?? undefined,
  })

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-4 py-8">
      <header className="text-center">
        <h1 className="font-display text-xl font-bold">{data.business.name}</h1>
        <p className="text-sm text-muted">Tu turno</p>
      </header>

      {msg ? <Banner tone="ok">{msg}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div
        className={
          cancelado
            ? 'rounded-2xl border border-line bg-surface-2 p-4 text-center'
            : 'rounded-2xl border border-brand/40 bg-brand-soft p-4 text-center'
        }
      >
        <p className="text-sm">{longDay(data.start, tz)}</p>
        <p className="font-display text-3xl font-bold">{hhmm(data.start, tz)}</p>
        <p className="mt-1 text-sm">
          {data.service} · con {data.staff}
        </p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide">
          {cancelado
            ? 'Cancelado'
            : data.status === 'pending'
              ? 'A confirmar'
              : data.status === 'completed'
                ? 'Asististe'
                : data.status === 'no_show'
                  ? 'No viniste'
                  : 'Confirmado'}
        </p>
      </div>

      {!cancelado ? (
        <div className="space-y-2">
          {data.status === 'pending' ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => void accion('confirm')}
            >
              Confirmar que voy
            </Button>
          ) : null}

          <a
            href={icsDataUrl(ics)}
            download="turno.ics"
            className="block rounded-xl border border-line bg-surface px-4 py-3 text-center font-medium no-underline"
          >
            🗓️ Agregar a mi calendario
          </a>

          {data.business.whatsapp ? (
            <a
              href={waLink(data.business.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-line bg-surface px-4 py-3 text-center font-medium no-underline"
            >
              💬 Escribir al negocio
            </a>
          ) : null}

          {data.can_cancel ? (
            <Button
              variant="danger"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => void accion('cancel')}
            >
              Cancelar mi turno
            </Button>
          ) : (
            <p className="text-center text-xs text-muted">
              Ya no se puede cancelar online (el límite es {data.cancel_window_hours} h antes).
              Escribile al negocio por WhatsApp.
            </p>
          )}
        </div>
      ) : (
        <a
          href={`/r/${data.business.slug}`}
          className="block rounded-xl bg-brand px-4 py-3 text-center font-semibold text-on-brand no-underline"
        >
          Reservar otro turno
        </a>
      )}

      {data.business.address ? (
        <p className="text-center text-sm text-muted">
          <a
            className="underline underline-offset-2"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.business.address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 {data.business.address}
          </a>
        </p>
      ) : null}
    </main>
  )
}
