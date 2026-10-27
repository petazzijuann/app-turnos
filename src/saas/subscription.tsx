/**
 * SAAS · Suscripción del usuario (Lemon Squeezy).
 * La fila de `subscriptions` solo la escribe el webhook con la service role
 * key; acá se lee y se traduce a permisos con `accessFor` (función pura).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { accessFor, type Access, type SubscriptionRow } from '../shared/access'
import { useAuth } from './auth'
import { config } from './config'
import { supabase } from './supabase'

type Row = {
  status: string
  trial_ends_at: string | null
  renews_at: string | null
  ends_at: string | null
  update_payment_url: string | null
  customer_portal_url: string | null
  lemon_subscription_id: string | null
}

type SubValue = {
  loading: boolean
  row: Row | null
  access: Access
  refresh: () => Promise<Row | null>
  /** Espera (sondeando) a que el webhook registre la suscripción. */
  waitForSubscription: (timeoutMs?: number) => Promise<boolean>
  /** URL del checkout con el mail y el user_id ya cargados. */
  checkoutUrl: string
}

const Ctx = createContext<SubValue | null>(null)

export function useSubscription() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSubscription debe usarse dentro de <SubscriptionProvider>')
  return ctx
}

const FIELDS =
  'status, trial_ends_at, renews_at, ends_at, update_payment_url, customer_portal_url, lemon_subscription_id'

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const fetchRow = useCallback(async (): Promise<Row | null> => {
    if (!user) return null
    const { data, error } = await supabase
      .from('subscriptions')
      .select(FIELDS)
      .eq('user_id', user.id)
      .eq('app', config.app)
      .maybeSingle()
    if (error) {
      console.error('No pudimos leer la suscripción', error.message)
      return null
    }
    return (data as Row | null) ?? null
  }, [user])

  const refresh = useCallback(async () => {
    const r = await fetchRow()
    if (alive.current) setRow(r)
    return r
  }, [fetchRow])

  useEffect(() => {
    if (!user) {
      setRow(null)
      setLoading(false)
      return
    }
    setLoading(true)
    refresh().finally(() => {
      if (alive.current) setLoading(false)
    })
  }, [user, refresh])

  /**
   * Al volver del checkout, el webhook puede tardar unos segundos. Sondeamos
   * cada 2 s hasta que aparezca la fila (o hasta el timeout).
   */
  const waitForSubscription = useCallback(
    async (timeoutMs = 45_000) => {
      const until = Date.now() + timeoutMs
      while (Date.now() < until && alive.current) {
        const r = await refresh()
        if (r && accessFor(r).level !== 'none') return true
        await new Promise((res) => setTimeout(res, 2000))
      }
      return false
    },
    [refresh]
  )

  const access = useMemo(() => accessFor(row as SubscriptionRow), [row])

  const checkoutUrl = useMemo(() => {
    if (!config.checkoutUrl || !user) return config.checkoutUrl
    const url = new URL(config.checkoutUrl)
    url.searchParams.set('checkout[email]', user.email ?? '')
    url.searchParams.set('checkout[custom][user_id]', user.id)
    // Al volver, la app sabe que tiene que esperar al webhook.
    url.searchParams.set('checkout[success_url]', `${config.origin}/?checkout=ok`)
    return url.toString()
  }, [user])

  const value = useMemo<SubValue>(
    () => ({ loading, row, access, refresh, waitForSubscription, checkoutUrl }),
    [loading, row, access, refresh, waitForSubscription, checkoutUrl]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
