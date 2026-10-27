/** SAAS · Instalación de la PWA y cuidado de los datos en el celular. */
import { useEffect, useState } from 'react'
import { readJSON, writeJSON } from './storage'
import { Button, cx } from './ui'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true)

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * Aviso para instalar la app:
 * - Android/Chrome: botón real con el evento `beforeinstallprompt`.
 * - iPhone/Safari: instrucciones, porque no existe ese evento.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => readJSON('installHintDismissed', false))

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as InstallEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const close = () => {
    setDismissed(true)
    writeJSON('installHintDismissed', true)
  }

  if (dismissed || isStandalone()) return null

  const ios = isIOS() && !deferred
  if (!deferred && !ios) return null

  return (
    <div
      className={cx(
        'no-print mx-auto mt-3 flex w-full max-w-5xl items-start gap-3 rounded-xl',
        'border border-brand/30 bg-brand-soft px-3 py-2.5 text-sm'
      )}
    >
      <p className="min-w-0 flex-1">
        {ios ? (
          <>
            Agregá la app a tu pantalla de inicio para abrirla de un toque:{' '}
            <strong>Compartir</strong> → <strong>Agregar a inicio</strong>.
          </>
        ) : (
          <>Instalá la app para abrir tu agenda de un toque, como cualquier otra app.</>
        )}
      </p>
      {deferred ? (
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            await deferred.prompt()
            await deferred.userChoice
            setDeferred(null)
          }}
        >
          Instalar app
        </Button>
      ) : null}
      <button
        onClick={close}
        aria-label="Cerrar aviso"
        className="shrink-0 rounded-lg px-2 py-1 text-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  )
}
