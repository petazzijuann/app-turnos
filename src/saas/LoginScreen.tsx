/** SAAS · Entrar con el mail (código de 6 dígitos o link del mail). */
import { useState, type FormEvent } from 'react'
import { authMessage, useAuth } from './auth'
import { config } from './config'
import { Logo } from './Logo'
import { Banner, Button } from './ui'

export function LoginScreen() {
  const { sendCode, verifyCode } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onEmail(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await sendCode(email)
      setStep('code')
      setSent(true)
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onCode(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email, code)
      // El AuthProvider se entera por onAuthStateChange y cambia la pantalla.
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {config.appName} · {config.brand}
        </h1>
        <p className="mt-2 text-sm text-muted">{config.tagline}</p>
      </header>

      {step === 'email' ? (
        <form onSubmit={onEmail} className="fl-card space-y-3 p-5" noValidate>
          <div>
            <label className="fl-label" htmlFor="login-email">
              Tu mail
            </label>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className="fl-input"
              placeholder="vos@tunegocio.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              aria-invalid={!!error}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Enviando…' : 'Entrar'}
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            Te mandamos un código al mail. Sin contraseñas: si es la primera vez, te creamos la
            cuenta ahí mismo.
          </p>
        </form>
      ) : (
        <form onSubmit={onCode} className="fl-card space-y-3 p-5" noValidate>
          {sent ? (
            <Banner tone="ok">
              Te mandamos un código a <strong className="break-all">{email}</strong>.
            </Banner>
          ) : null}
          <div>
            <label className="fl-label" htmlFor="login-code">
              Código de 6 dígitos
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              className="fl-input text-center font-mono text-xl tracking-[0.4em]"
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                setError(null)
              }}
              aria-invalid={!!error}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || code.length < 6}
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            También podés entrar tocando el link del mail. Revisá el spam si no llega.
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
              }}
            >
              Cambiar mail
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await sendCode(email)
                  setSent(true)
                } catch (err) {
                  setError(authMessage(err))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Reenviar código
            </Button>
          </div>
        </form>
      )}

      <footer className="text-center text-xs text-muted">
        <a className="underline underline-offset-2" href={config.landingUrl}>
          Ver qué hace {config.appName}
        </a>
        {' · '}
        <a className="underline underline-offset-2" href={`mailto:${config.supportEmail}`}>
          {config.supportEmail}
        </a>
      </footer>
    </main>
  )
}
