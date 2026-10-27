/** SAAS · "Activa tu prueba gratis" y la espera al webhook al volver. */
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { config } from './config'
import { Logo } from './Logo'
import { useSubscription } from './subscription'
import { Banner, LinkButton } from './ui'

export function SubscribeScreen() {
  const { user, signOut } = useAuth()
  const { access, checkoutUrl, waitForSubscription, refresh } = useSubscription()
  const [waiting, setWaiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Volvió del checkout: esperamos a que el webhook registre la suscripción.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('checkout') !== 'ok') return
    history.replaceState(null, '', location.pathname)
    setWaiting(true)
    waitForSubscription().then((ok) => {
      setWaiting(false)
      if (!ok) setTimedOut(true)
    })
  }, [waitForSubscription])

  const reactivar = access.level === 'readonly'
  const faltaChequeout = !config.checkoutUrl

  if (waiting) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Logo />
        <h1 className="font-display text-xl font-semibold">Estamos activando tu cuenta…</h1>
        <p className="text-sm text-muted">
          Tarda unos segundos. No cierres esta pantalla.
        </p>
        <div
          className="size-8 animate-spin rounded-full border-2 border-line border-t-brand"
          aria-label="Cargando"
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {reactivar ? 'Reactiva tu plan' : `Activa tu prueba gratis de ${config.trialDays} días`}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {reactivar
            ? 'Tu plan no está activo: tu página de reservas está pausada y no podés agendar turnos nuevos.'
            : `Probá ${config.appName} completo. Después, ${config.price}. Cancelás cuando quieras.`}
        </p>
      </header>

      {timedOut ? (
        <Banner tone="warn">
          El pago salió bien pero todavía no vemos la suscripción.{' '}
          <button className="underline underline-offset-2" onClick={() => void refresh()}>
            Volver a chequear
          </button>
          .
        </Banner>
      ) : null}
      {access.notice ? <Banner tone="warn">{access.notice}</Banner> : null}

      <div className="fl-card space-y-4 p-5">
        <ul className="space-y-2 text-sm">
          {[
            'Tu página de reservas: tus clientes eligen servicio, persona y horario solos.',
            'Agenda del día y de la semana, en el celu o en la compu.',
            'Recordatorios por WhatsApp en un toque, con tu mensaje.',
            'Clientes, historial y cuántas veces faltaron.',
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true" className="text-ok">
                ✓
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        {faltaChequeout ? (
          <Banner tone="danger">
            Falta configurar VITE_LS_CHECKOUT_URL (link del producto en Lemon Squeezy).
          </Banner>
        ) : (
          <LinkButton href={checkoutUrl} variant="primary" size="lg" className="w-full">
            {reactivar ? 'Reactivar mi plan' : `Empezar la prueba de ${config.trialDays} días`}
          </LinkButton>
        )}
        <p className="text-xs leading-relaxed text-muted">
          Se pide la tarjeta al empezar la prueba, pero no se cobra nada hasta el día{' '}
          {config.trialDays + 1}. Podés cancelar antes desde "Mi plan".
        </p>
      </div>

      <footer className="text-center text-xs text-muted">
        Entraste como <span className="break-all">{user?.email}</span>
        {' · '}
        <button className="underline underline-offset-2" onClick={() => void signOut()}>
          Salir
        </button>
      </footer>
    </main>
  )
}
