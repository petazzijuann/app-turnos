/**
 * SAAS · Sesión del usuario. Login por mail con código de 6 dígitos o link
 * (los manda Supabase Auth, que ya tiene el SMTP de Resend conectado).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { config } from './config'
import { supabase } from './supabase'

type AuthValue = {
  loading: boolean
  session: Session | null
  user: User | null
  /** Manda el mail con el código y el link. */
  sendCode: (email: string) => Promise<void>
  /** Valida el código de 6 dígitos. */
  verifyCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** Mensajes de Supabase traducidos a algo que se entienda. */
export function authMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const m = raw.toLowerCase()
  if (m.includes('invalid') && (m.includes('token') || m.includes('otp')))
    return 'Ese código no es válido o ya venció. Pedí uno nuevo.'
  if (m.includes('expired')) return 'El código venció. Pedí uno nuevo.'
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds'))
    return 'Probá de nuevo en un minuto: pedimos demasiados códigos seguidos.'
  if (m.includes('email') && m.includes('invalid')) return 'Revisá el mail: no parece válido.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Sin conexión. Revisá internet y probá otra vez.'
  return 'No pudimos entrar. Probá de nuevo en un momento.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const sendCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${config.origin}/`,
      },
    })
    if (error) throw error
  }, [])

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ''),
      type: 'email',
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ loading, session, user: session?.user ?? null, sendCode, verifyCode, signOut }),
    [loading, session, sendCode, verifyCode, signOut]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
