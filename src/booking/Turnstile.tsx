/**
 * PÁGINA PÚBLICA · Widget de Cloudflare Turnstile.
 * Se carga el script una sola vez y recién cuando hace falta, para no pesar
 * en la primera pintada de la página.
 */
import { useEffect, useRef, useState } from 'react'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(s)
  })
  return loading
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string
  onToken: (token: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    if (!siteKey) {
      // Sin clave configurada no bloqueamos la reserva: el servidor decide.
      onToken('')
      return
    }
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          action: 'reserva',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (widget.current && window.turnstile) {
        try {
          window.turnstile.remove(widget.current)
        } catch {
          /* ya se fue */
        }
      }
    }
  }, [siteKey, onToken])

  if (failed)
    return (
      <p className="text-xs text-danger">
        No pudimos cargar la verificación anti-spam. Revisá tu conexión y recargá.
      </p>
    )

  return <div ref={box} className="min-h-[65px]" />
}
